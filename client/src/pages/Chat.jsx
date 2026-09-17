import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { socketUrl } from '../config';

export default function Chat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activePartner, setActivePartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    api.chat.conversations()
      .then(setConversations)
      .catch(console.error)
      .finally(() => setLoading(false));

    const token = localStorage.getItem('token');
    socketRef.current = io(socketUrl(), {
      auth: { token },
    });

    socketRef.current.on('new_message', (msg) => {
      if (
        activePartner &&
        (msg.sender_id === activePartner.partner_id || msg.receiver_id === activePartner.partner_id)
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socketRef.current.on('notification', (notif) => {
      console.log('Notification:', notif);
    });

    return () => socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (!activePartner) return;

    api.chat.messages(activePartner.partner_id)
      .then(setMessages)
      .catch(console.error);

    socketRef.current?.emit('join_chat', { partnerId: activePartner.partner_id });
  }, [activePartner]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activePartner) return;

    const content = newMessage.trim();
    setNewMessage('');

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('send_message', {
          receiverId: activePartner.partner_id,
          content,
        });
      } else {
        const msg = await api.chat.send({
          receiverId: activePartner.partner_id,
          content,
        });
        setMessages((prev) => [...prev, { ...msg, sender_name: user.full_name }]);
      }
    } catch (err) {
      alert(err.message);
      setNewMessage(content);
    }
  };

  if (loading) return <div className="loading">Loading messages...</div>;

  return (
    <div className="container">
      <h1 style={{ marginBottom: '0.5rem' }}>Messages</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Chat with your healthcare providers in real time
      </p>

      <div className="card" style={{ display: 'flex', height: '500px', padding: 0, overflow: 'hidden' }}>
        <div style={{ width: '280px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {conversations.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.partner_id}
                onClick={() => setActivePartner(conv)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '1rem',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: activePartner?.partner_id === conv.partner_id ? 'var(--bg)' : 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600 }}>{conv.partner_name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {conv.partner_role} · {conv.last_message?.slice(0, 30)}...
                </div>
                {conv.unread_count > 0 && (
                  <span className="badge badge-confirmed" style={{ marginTop: '0.25rem' }}>
                    {conv.unread_count} new
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {activePartner ? (
            <>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                {activePartner.partner_name}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.sender_id === user.id ? 'flex-end' : 'flex-start',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '70%',
                        padding: '0.625rem 1rem',
                        borderRadius: 'var(--radius)',
                        background: msg.sender_id === user.id ? 'var(--primary)' : 'var(--bg)',
                        color: msg.sender_id === user.id ? 'white' : 'var(--text)',
                        fontSize: '0.9375rem',
                      }}
                    >
                      {msg.content}
                      <div style={{ fontSize: '0.6875rem', opacity: 0.7, marginTop: '0.25rem' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.sender_id !== user.id && msg.is_read && ' · Read'}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: '0.625rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                />
                <button type="submit" className="btn btn-primary">Send</button>
              </form>
            </>
          ) : (
            <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
