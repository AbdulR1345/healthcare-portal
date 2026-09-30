import { useEffect, useState, useRef } from "react";
import { ArrowLeft, LockKeyhole, MessageCircle, Send } from "lucide-react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { socketUrl } from "../config";

export default function Chat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activePartner, setActivePartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [chatError, setChatError] = useState("");
  const [liveNotice, setLiveNotice] = useState("");
  const [messageError, setMessageError] = useState("");
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const socketRef = useRef(null);
  const activePartnerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const preserveScrollHeightRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let active = true;

    const connectSocket = () => {
      const token = localStorage.getItem("token");
      socketRef.current = io(socketUrl(), { auth: { token } });

      socketRef.current.on("new_message", (msg) => {
        const currentPartner = activePartnerRef.current;
        const partnerId =
          msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        setConversations((current) =>
          current.map((conversation) =>
            conversation.partner_id === partnerId
              ? {
                  ...conversation,
                  last_message: msg.content,
                  last_at: msg.created_at,
                  unread_count:
                    msg.sender_id === user.id ||
                    currentPartner?.partner_id === partnerId
                      ? 0
                      : Number(conversation.unread_count || 0) + 1,
                }
              : conversation,
          ),
        );
        if (
          currentPartner?.partner_id === msg.sender_id &&
          msg.receiver_id === user.id
        ) {
          socketRef.current?.emit("mark_read", { senderId: msg.sender_id });
        }
        if (
          currentPartner &&
          (msg.sender_id === currentPartner.partner_id ||
            msg.receiver_id === currentPartner.partner_id)
        ) {
          setMessages((previous) =>
            previous.some((item) => item.id === msg.id)
              ? previous
              : [...previous, msg],
          );
        }
      });

      socketRef.current.on("chat_error", ({ error }) => setMessageError(error));
      socketRef.current.on("connect_error", () =>
        setChatError("Real-time chat is unavailable."),
      );
      socketRef.current.on("presence", ({ userId, online }) => {
        if (userId === activePartnerRef.current?.partner_id)
          setPartnerOnline(online);
      });
      socketRef.current.on("typing", ({ userId }) => {
        if (userId === activePartnerRef.current?.partner_id)
          setPartnerTyping(true);
      });
      socketRef.current.on("stop_typing", ({ userId }) => {
        if (userId === activePartnerRef.current?.partner_id)
          setPartnerTyping(false);
      });
      socketRef.current.on("notification", (notif) => {
        setLiveNotice(`New message from ${notif.from || "your care team"}`);
        window.setTimeout(() => setLiveNotice(""), 5000);
      });
    };

    api.chat
      .conversations()
      .then((result) => {
        if (active) setConversations(result);
      })
      .catch((error) => {
        if (active) setChatError(error.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        connectSocket();
      });

    return () => {
      active = false;
      clearTimeout(typingTimeoutRef.current);
      socketRef.current?.disconnect();
    };
  }, [user.id]);

  useEffect(() => {
    activePartnerRef.current = activePartner;
    if (!activePartner) return;

    setMessages([]);
    setHasOlderMessages(false);
    setMessageError("");
    setPartnerTyping(false);
    setMessageLoading(true);
    api.chat
      .messages(activePartner.partner_id)
      .then((result) => {
        setMessages(result);
        setConversations((current) =>
          current.map((conversation) =>
            conversation.partner_id === activePartner.partner_id
              ? { ...conversation, unread_count: 0 }
              : conversation,
          ),
        );
        setHasOlderMessages(result.length === 50);
      })
      .catch((error) => setMessageError(error.message))
      .finally(() => setMessageLoading(false));

    socketRef.current?.emit(
      "join_chat",
      { partnerId: activePartner.partner_id },
      (result) => {
        if (!result?.ok)
          setMessageError(result?.error || "Unable to open conversation.");
        else setPartnerOnline(result.partnerOnline);
      },
    );
  }, [activePartner]);

  useEffect(() => {
    if (
      preserveScrollHeightRef.current !== null &&
      messagesContainerRef.current
    ) {
      const container = messagesContainerRef.current;
      container.scrollTop +=
        container.scrollHeight - preserveScrollHeightRef.current;
      preserveScrollHeightRef.current = null;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadOlderMessages = async () => {
    const cursor = messages[0]?.id;
    if (!activePartner || !cursor || olderLoading) return;

    preserveScrollHeightRef.current =
      messagesContainerRef.current?.scrollHeight ?? null;
    setOlderLoading(true);
    setMessageError("");
    try {
      const olderMessages = await api.chat.messages(activePartner.partner_id, {
        before: cursor,
      });
      setMessages((current) => [...olderMessages, ...current]);
      setHasOlderMessages(olderMessages.length === 50);
    } catch (error) {
      preserveScrollHeightRef.current = null;
      setMessageError(error.message);
    } finally {
      setOlderLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activePartner || newMessage.trim().length > 5000)
      return;

    const content = newMessage.trim();
    setNewMessage("");
    setMessageError("");

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit(
          "send_message",
          {
            receiverId: activePartner.partner_id,
            content,
          },
          (result) => {
            if (!result?.ok) {
              setMessageError(result?.error || "Message could not be sent.");
              setNewMessage(content);
            }
          },
        );
      } else {
        const msg = await api.chat.send({
          receiverId: activePartner.partner_id,
          content,
        });
        setMessages((prev) => [
          ...prev,
          { ...msg, sender_name: user.full_name },
        ]);
        setConversations((current) =>
          current.map((conversation) =>
            conversation.partner_id === activePartner.partner_id
              ? {
                  ...conversation,
                  last_message: content,
                  last_at: msg.created_at,
                }
              : conversation,
          ),
        );
      }
    } catch (err) {
      setMessageError(err.message);
      setNewMessage(content);
    }
  };

  const handleTyping = (value) => {
    setNewMessage(value);
    if (!activePartner || !socketRef.current?.connected) return;
    socketRef.current.emit("typing", { partnerId: activePartner.partner_id });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("stop_typing", {
        partnerId: activePartner.partner_id,
      });
    }, 800);
  };

  const loadConversations = async () => {
    setChatError("");
    setLoading(true);
    try {
      setConversations(await api.chat.conversations());
    } catch (error) {
      setChatError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <main className="container chat-page">
        <div className="skeleton dashboard-heading-skeleton" />
        <div className="skeleton chat-skeleton" />
      </main>
    );

  return (
    <main className="container chat-page">
      <header className="page-heading">
        <p className="eyebrow">Care team</p>
        <h1>Messages</h1>
        <p>Private conversations with people connected to your care.</p>
      </header>
      {liveNotice && (
        <div className="alert alert-info chat-notice" role="status">
          {liveNotice}
        </div>
      )}
      <section
        className={`chat-workspace ${activePartner ? "has-active-chat" : ""}`}
        aria-label="Secure messages"
      >
        <aside className="conversation-sidebar">
          <div className="conversation-sidebar-head">
            <div>
              <h2>Conversations</h2>
              <span>{conversations.length} connected</span>
            </div>
            <MessageCircle size={17} />
          </div>
          {chatError && (
            <div className="chat-inline-error" role="alert">
              {chatError}
              <button className="text-button" onClick={loadConversations}>
                Retry
              </button>
            </div>
          )}
          {conversations.length ? (
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <button
                  key={conversation.partner_id}
                  type="button"
                  className={`conversation-item ${activePartner?.partner_id === conversation.partner_id ? "is-active" : ""}`}
                  onClick={() => setActivePartner(conversation)}
                  aria-pressed={
                    activePartner?.partner_id === conversation.partner_id
                  }
                >
                  <span className="conversation-avatar">
                    {conversation.partner_name?.slice(0, 1)?.toUpperCase()}
                  </span>
                  <span className="conversation-copy">
                    <strong>{conversation.partner_name}</strong>
                    <span className="conversation-role">
                      {conversation.partner_role}
                    </span>
                    <span className="conversation-preview">
                      {conversation.last_message || "Start a conversation"}
                    </span>
                  </span>
                  {Number(conversation.unread_count) > 0 && (
                    <span
                      className="unread-count"
                      aria-label={`${conversation.unread_count} unread messages`}
                    >
                      {conversation.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            !chatError && (
              <div className="chat-empty-list">
                <MessageCircle size={22} />
                <p>No conversations yet</p>
                <span>
                  Messages are available when you have an active care
                  relationship.
                </span>
              </div>
            )
          )}
        </aside>

        <section
          className="conversation-panel"
          aria-label={
            activePartner
              ? `Conversation with ${activePartner.partner_name}`
              : "No conversation selected"
          }
        >
          {activePartner ? (
            <>
              <header className="conversation-header">
                <button
                  className="icon-button chat-back-button"
                  type="button"
                  onClick={() => setActivePartner(null)}
                  aria-label="Back to conversations"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="conversation-avatar conversation-avatar-large">
                  {activePartner.partner_name?.slice(0, 1)?.toUpperCase()}
                </span>
                <div className="conversation-header-copy">
                  <strong>{activePartner.partner_name}</strong>
                  <span
                    className={
                      partnerOnline ? "presence-online" : "presence-offline"
                    }
                  >
                    <i />
                    {partnerTyping
                      ? "Typing..."
                      : partnerOnline
                        ? "Online"
                        : "Offline"}
                  </span>
                </div>
                <LockKeyhole
                  size={16}
                  className="chat-secure-icon"
                  aria-label="Secure conversation"
                />
              </header>
              <div
                className="message-history"
                ref={messagesContainerRef}
                aria-live="polite"
              >
                {hasOlderMessages && (
                  <button
                    className="button button-secondary button-small load-older-button"
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={olderLoading}
                  >
                    {olderLoading ? "Loading..." : "Load older messages"}
                  </button>
                )}
                {messageLoading && (
                  <div className="message-loading" role="status">
                    Loading messages...
                  </div>
                )}
                {messageError && (
                  <div className="alert alert-error" role="alert">
                    {messageError}{" "}
                    <button
                      className="text-button"
                      onClick={() => setActivePartner({ ...activePartner })}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!messageLoading && !messageError && messages.length === 0 && (
                  <div className="chat-empty-history">
                    <MessageCircle size={24} />
                    <p>No messages yet</p>
                    <span>Send a message to begin the conversation.</span>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-row ${message.sender_id === user.id ? "is-mine" : ""}`}
                  >
                    <div className="message-bubble">
                      {message.content}
                      <span className="message-meta">
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {message.sender_id === user.id &&
                          message.is_read &&
                          " · Read"}
                      </span>
                    </div>
                  </div>
                ))}
                {partnerTyping && (
                  <div className="typing-indicator" role="status">
                    <span />
                    <span />
                    <span /> Typing
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="message-composer" onSubmit={handleSend}>
                <label className="sr-only" htmlFor="message">
                  Write a message
                </label>
                <textarea
                  id="message"
                  value={newMessage}
                  onChange={(event) => handleTyping(event.target.value)}
                  placeholder="Write a message..."
                  maxLength={5000}
                  rows={1}
                />
                <div className="composer-footer">
                  <span>{newMessage.length}/5000</span>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={
                      !newMessage.trim() || newMessage.trim().length > 5000
                    }
                  >
                    <Send size={15} /> Send
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="chat-select-prompt">
              <span className="chat-prompt-icon">
                <MessageCircle size={24} />
              </span>
              <h2>Select a conversation</h2>
              <p>Choose a care-team conversation to view messages.</p>
            </div>
          )}
        </section>
      </section>
      <p className="chat-privacy-note">
        <LockKeyhole size={14} /> Messages are limited to existing care
        relationships.
      </p>
    </main>
  );
}
