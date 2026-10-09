import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import AppointmentCard from "../components/Appointment";

export default function PatientDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState({
    appointments: [],
    reminders: [],
    documents: [],
    conversations: [],
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [actionError, setActionError] = useState("");

  const loadDashboard = () => {
    setLoading(true);
    Promise.allSettled([
      api.appointments.list(),
      api.admin.reminders(),
      api.documents.list(),
      api.chat.conversations(),
    ])
      .then((results) => {
        const keys = [
          "appointments",
          "reminders",
          "documents",
          "conversations",
        ];
        const next = {};
        const nextErrors = {};
        results.forEach((result, index) => {
          next[keys[index]] = result.status === "fulfilled" ? result.value : [];
          if (result.status === "rejected")
            nextErrors[keys[index]] = result.reason.message;
        });
        setDashboard(next);
        setErrors(nextErrors);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const appointments = dashboard.appointments;
  const reminders = dashboard.reminders
    .filter((reminder) => !reminder.sent)
    .slice(0, 3);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const upcoming = appointments
    .filter(
      (appointment) =>
        ["scheduled", "confirmed"].includes(appointment.status) &&
        appointment.appointment_date >= todayKey,
    )
    .sort((a, b) =>
      `${a.appointment_date}${a.start_time}`.localeCompare(
        `${b.appointment_date}${b.start_time}`,
      ),
    );
  const previous = appointments.filter(
    (a) => a.status === "completed" || a.status === "cancelled",
  );
  const unreadMessages = dashboard.conversations.reduce(
    (total, conversation) => total + Number(conversation.unread_count || 0),
    0,
  );
  const recentDocuments = dashboard.documents.slice(0, 4);

  const handleCancel = async (id) => {
    setActionError("");
    try {
      const updated = await api.appointments.updateStatus(id, "cancelled");
      setDashboard((current) => ({
        ...current,
        appointments: current.appointments.map((item) =>
          item.id === id ? { ...item, ...updated } : item,
        ),
      }));
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (loading)
    return (
      <main className="container dashboard-page">
        <div className="skeleton dashboard-heading-skeleton" />
        <div className="dashboard-stat-grid">
          <div className="skeleton stat-skeleton" />
          <div className="skeleton stat-skeleton" />
          <div className="skeleton stat-skeleton" />
        </div>
        <div className="skeleton dashboard-panel-skeleton" />
      </main>
    );

  return (
    <main className="container dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">Patient workspace</p>
          {user?.is_demo && <span className="badge badge-demo">Demo workspace</span>}
          <h1>
            Good{" "}
            {new Date().getHours() < 12
              ? "morning"
              : new Date().getHours() < 18
                ? "afternoon"
                : "evening"}
            , {user.full_name?.split(" ")[0]}.
          </h1>
          <p>Your care, appointments, and records in one place.</p>
        </div>
        <Link className="button button-primary" to="/doctors">
          <Plus size={16} /> Find a clinician
        </Link>
      </header>
      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <div className="alert alert-info" role="status">
          Some workspace information couldn't be loaded.{" "}
          <button className="text-button" onClick={loadDashboard}>
            Try again
          </button>
        </div>
      )}
      <div className="dashboard-stat-grid">
        <Link to="/appointments" className="dashboard-stat">
          <span className="stat-icon">
            <CalendarDays size={18} />
          </span>
          <span className="stat-label">Upcoming appointments</span>
          <strong>{upcoming.length}</strong>
          <span className="stat-caption">
            In your schedule <ArrowRight size={13} />
          </span>
        </Link>
        <Link to="/documents" className="dashboard-stat">
          <span className="stat-icon">
            <FileText size={18} />
          </span>
          <span className="stat-label">Medical records</span>
          <strong>{dashboard.documents.length}</strong>
          <span className="stat-caption">
            Private documents <ArrowRight size={13} />
          </span>
        </Link>
        <Link to="/chat" className="dashboard-stat">
          <span className="stat-icon">
            <MessageCircle size={18} />
          </span>
          <span className="stat-label">Unread messages</span>
          <strong>{unreadMessages}</strong>
          <span className="stat-caption">
            Care-team conversations <ArrowRight size={13} />
          </span>
        </Link>
      </div>
      <div className="dashboard-main-grid">
        <section className="dashboard-section">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Next up</p>
              <h2>Upcoming appointments</h2>
            </div>
            <Link className="text-link" to="/appointments">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {errors.appointments ? (
            <div className="inline-error">Appointments couldn't be loaded.</div>
          ) : upcoming.length ? (
            <div className="appointment-list">
              {upcoming.slice(0, 3).map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onStatusChange={(id, status) =>
                    status === "cancelled" && handleCancel(id)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays size={22} />
              <p>No upcoming appointments.</p>
              <Link
                className="button button-secondary button-small"
                to="/doctors"
              >
                <Search size={14} /> Find a clinician
              </Link>
            </div>
          )}
          {previous.length > 0 && (
            <div className="history-link-row">
              <span>
                {previous.length} past appointment
                {previous.length === 1 ? "" : "s"}
              </span>
              <Link to="/appointments?view=history">
                Review history <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>
        <aside className="dashboard-side-column">
          <section className="dashboard-section reminders-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Stay prepared</p>
                <h2>Reminders</h2>
              </div>
              <CalendarDays size={17} />
            </div>
            {reminders.length ? (
              reminders.map((reminder) => (
                <div key={reminder.id} className="reminder-row">
                  <span className="reminder-dot" />
                  <p>{reminder.message}</p>
                </div>
              ))
            ) : (
              <p className="muted text-small">No upcoming reminders.</p>
            )}
          </section>
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Your files</p>
                <h2>Recent records</h2>
              </div>
              <Link className="text-link" to="/documents">
                All records <ArrowRight size={14} />
              </Link>
            </div>
            {errors.documents ? (
              <div className="inline-error">Records couldn't be loaded.</div>
            ) : recentDocuments.length ? (
              <div className="recent-documents">
                {recentDocuments.map((doc) => (
                  <Link
                    to="/documents"
                    className="recent-document"
                    key={doc.id}
                  >
                    <span className="document-file-icon">
                      <FileText size={16} />
                    </span>
                    <span className="recent-document-copy">
                      <strong>{doc.file_name}</strong>
                      <span>
                        {doc.ai_processing_status || "pending"} ·{" "}
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </span>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="compact-empty">
                No records uploaded yet.{" "}
                <Link to="/documents">Add a document</Link>
              </div>
            )}
          </section>
          <div className="dashboard-privacy-note">
            <ShieldCheck size={17} />
            <p>
              Your records are only available in authenticated care workflows.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
