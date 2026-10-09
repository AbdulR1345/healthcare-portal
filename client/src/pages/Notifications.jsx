import { useEffect, useState } from "react";
import { ArrowRight, Bell, CalendarDays, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function Notifications() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = () => {
    setLoading(true);
    setError("");
    const requests = [api.admin.reminders()];
    if (user.role !== "admin") requests.push(api.chat.conversations());
    Promise.all(requests)
      .then(([reminderData, conversationData = []]) => {
        setReminders(reminderData);
        setConversations(conversationData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotifications();
    window.addEventListener("appointments:changed", loadNotifications);
    return () =>
      window.removeEventListener("appointments:changed", loadNotifications);
  }, [user.role]);

  if (loading)
    return (
      <div className="page-loader" role="status">
        Loading notifications
      </div>
    );
  const unreadConversations = conversations.filter(
    (conversation) => Number(conversation.unread_count) > 0,
  );

  return (
    <main className="container notifications-page">
      <header className="page-heading">
        <p className="eyebrow">Updates</p>
        <h1>Notifications</h1>
        <p>Appointment reminders and unread care-team messages.</p>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}{" "}
          <button className="text-button" onClick={loadNotifications}>
            Try again
          </button>
        </div>
      )}
      {!error && (
        <div className="notification-groups">
          {unreadConversations.length > 0 && (
            <section className="notification-section">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Messages</p>
                  <h2>Unread conversations</h2>
                </div>
                <MessageCircle size={18} />
              </div>
              {unreadConversations.map((conversation) => (
                <Link
                  className="notification-row"
                  to="/chat"
                  key={conversation.partner_id}
                >
                  <span className="notification-icon">
                    <MessageCircle size={17} />
                  </span>
                  <span className="notification-copy">
                    <strong>{conversation.partner_name}</strong>
                    <span>
                      {conversation.unread_count} unread message
                      {Number(conversation.unread_count) === 1 ? "" : "s"}
                      {conversation.last_message
                        ? ` · ${conversation.last_message}`
                        : ""}
                    </span>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </section>
          )}
          <section className="notification-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Appointments</p>
                <h2>Reminders</h2>
              </div>
              <CalendarDays size={18} />
            </div>
            {reminders.length ? (
              [...reminders]
                .sort(
                  (a, b) =>
                    new Date(b.scheduled_for) - new Date(a.scheduled_for),
                )
                .map((reminder) => (
                  <Link
                    to={
                      reminder.appointment_id
                        ? `/appointments/${reminder.appointment_id}`
                        : "/appointments"
                    }
                    className="notification-row"
                    key={reminder.id}
                  >
                    <span className="notification-icon">
                      <Bell size={17} />
                    </span>
                    <span className="notification-copy">
                      <strong>{reminder.message}</strong>
                      <span>
                        {reminder.appointment_date
                          ? new Date(
                              `${reminder.appointment_date}T12:00:00`,
                            ).toLocaleDateString(undefined, {
                              dateStyle: "medium",
                            })
                          : new Date(
                              reminder.scheduled_for,
                            ).toLocaleDateString()}{" "}
                        · {reminder.sent ? "Email sent" : "Scheduled"}
                      </span>
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                ))
            ) : (
              <div className="empty-state notification-empty">
                No appointment reminders right now.
              </div>
            )}
          </section>
          {!unreadConversations.length && !reminders.length && (
            <div className="notification-quiet">
              <span>
                <Bell size={20} />
              </span>
              <h2>You're all caught up</h2>
              <p>New reminders and unread messages will appear here.</p>
            </div>
          )}
        </div>
      )}
      <p className="disclaimer">
        Message notifications reflect unread counts returned by your secure
        conversations. This page does not store or mark reminders as read.
      </p>
    </main>
  );
}
