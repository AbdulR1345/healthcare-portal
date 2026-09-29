import { useEffect, useState, useRef } from "react";
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
    api.chat
      .conversations()
      .then(setConversations)
      .catch((error) => setChatError(error.message))
      .finally(() => setLoading(false));

    const token = localStorage.getItem("token");
    socketRef.current = io(socketUrl(), {
      auth: { token },
    });

    socketRef.current.on("new_message", (msg) => {
      const active = activePartnerRef.current;
      if (
        active &&
        (msg.sender_id === active.partner_id ||
          msg.receiver_id === active.partner_id)
      ) {
        setMessages((prev) =>
          prev.some((item) => item.id === msg.id) ? prev : [...prev, msg],
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
      console.log("Notification:", notif);
    });

    return () => socketRef.current?.disconnect();
  }, []);

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

  if (loading) return <div className="loading">Loading conversations...</div>;

  return (
    <div className="container">
      <h1 style={{ marginBottom: "0.5rem" }}>Messages</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
        Chat with your healthcare providers in real time
      </p>

      <div
        className="card"
        style={{
          display: "flex",
          height: "500px",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "280px",
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
          }}
        >
          {chatError && (
            <div
              role="alert"
              style={{ padding: "1rem", color: "var(--danger)" }}
            >
              {chatError}
            </div>
          )}
          {conversations.length === 0 ? (
            <div className="empty-state" style={{ padding: "2rem 1rem" }}>
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.partner_id}
                onClick={() => setActivePartner(conv)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "1rem",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background:
                    activePartner?.partner_id === conv.partner_id
                      ? "var(--bg)"
                      : "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontWeight: 600 }}>{conv.partner_name}</div>
                <div
                  style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}
                >
                  {conv.partner_role} · {conv.last_message?.slice(0, 30)}...
                </div>
                {conv.unread_count > 0 && (
                  <span
                    className="badge badge-confirmed"
                    style={{ marginTop: "0.25rem" }}
                  >
                    {conv.unread_count} new
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {activePartner ? (
            <>
              <div
                style={{
                  padding: "1rem",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: 600,
                }}
              >
                {activePartner.partner_name}
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    fontWeight: 400,
                  }}
                >
                  {partnerTyping
                    ? "Typing..."
                    : partnerOnline
                      ? "Online"
                      : "Offline"}
                </div>
              </div>
              <div
                ref={messagesContainerRef}
                style={{ flex: 1, overflowY: "auto", padding: "1rem" }}
              >
                {messageLoading ? (
                  <div className="loading">Loading messages...</div>
                ) : null}
                {messageError && (
                  <div
                    role="alert"
                    style={{ color: "var(--danger)", marginBottom: "1rem" }}
                  >
                    {messageError}
                  </div>
                )}
                {hasOlderMessages && (
                  <button
                    type="button"
                    onClick={loadOlderMessages}
                    disabled={olderLoading}
                  >
                    {olderLoading ? "Loading..." : "Load older messages"}
                  </button>
                )}
                {!messageLoading && !messageError && messages.length === 0 && (
                  <div className="empty-state">No messages yet</div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent:
                        msg.sender_id === user.id ? "flex-end" : "flex-start",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "70%",
                        padding: "0.625rem 1rem",
                        borderRadius: "var(--radius)",
                        background:
                          msg.sender_id === user.id
                            ? "var(--primary)"
                            : "var(--bg)",
                        color:
                          msg.sender_id === user.id ? "white" : "var(--text)",
                        fontSize: "0.9375rem",
                      }}
                    >
                      {msg.content}
                      <div
                        style={{
                          fontSize: "0.6875rem",
                          opacity: 0.7,
                          marginTop: "0.25rem",
                        }}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {msg.sender_id !== user.id && msg.is_read && " · Read"}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form
                onSubmit={handleSend}
                style={{
                  padding: "1rem",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <input
                  value={newMessage}
                  onChange={(e) => handleTyping(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={5000}
                  style={{
                    flex: 1,
                    padding: "0.625rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    !newMessage.trim() || newMessage.trim().length > 5000
                  }
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div
              className="empty-state"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
