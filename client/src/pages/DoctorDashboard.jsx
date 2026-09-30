import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  MessageCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import AppointmentCard from "../components/Appointment";

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadDashboard = () => {
    setLoading(true);
    setError("");
    Promise.all([
      api.appointments.list(),
      api.documents.list(),
      api.chat.conversations(),
    ])
      .then(([appointmentData, documentData, conversationData]) => {
        setAppointments(appointmentData);
        setDocuments(documentData);
        setConversations(conversationData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayAppts = appointments.filter(
    (a) => a.appointment_date === today && a.status !== "cancelled",
  );
  const upcoming = appointments.filter(
    (a) =>
      ["scheduled", "confirmed"].includes(a.status) &&
      a.appointment_date >= today,
  );

  const handleStatusChange = async (id, status) => {
    setActionError("");
    try {
      const updated = await api.appointments.updateStatus(id, status);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updated } : a)),
      );
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

  const patientCount = new Set(
    appointments.map((appointment) => appointment.patient_id),
  ).size;
  const unreadMessages = conversations.reduce(
    (total, conversation) => total + Number(conversation.unread_count || 0),
    0,
  );
  const documentActivity = documents.filter((document) =>
    ["pending", "processing", "failed"].includes(document.ai_processing_status),
  );
  const recentAppointments = [...appointments]
    .sort((a, b) =>
      `${b.appointment_date}${b.start_time}`.localeCompare(
        `${a.appointment_date}${a.start_time}`,
      ),
    )
    .slice(0, 4);

  return (
    <main className="container dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">Clinician workspace</p>
          <h1>Today's care, at a glance.</h1>
          <p>Review your schedule and stay connected with patients.</p>
        </div>
        <Link className="button button-primary" to="/appointments">
          <CalendarDays size={16} /> Full schedule
        </Link>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}{" "}
          <button className="text-button" onClick={loadDashboard}>
            Try again
          </button>
        </div>
      )}
      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}
      <div className="dashboard-stat-grid doctor-stat-grid">
        <Link to="/appointments" className="dashboard-stat">
          <span className="stat-icon">
            <CalendarDays size={18} />
          </span>
          <span className="stat-label">Today's appointments</span>
          <strong>{todayAppts.length}</strong>
          <span className="stat-caption">
            Your schedule <ArrowRight size={13} />
          </span>
        </Link>
        <Link to="/appointments" className="dashboard-stat">
          <span className="stat-icon">
            <Users size={18} />
          </span>
          <span className="stat-label">Patients in appointments</span>
          <strong>{patientCount}</strong>
          <span className="stat-caption">
            Across your records <ArrowRight size={13} />
          </span>
        </Link>
        <Link to="/chat" className="dashboard-stat">
          <span className="stat-icon">
            <MessageCircle size={18} />
          </span>
          <span className="stat-label">Unread messages</span>
          <strong>{unreadMessages}</strong>
          <span className="stat-caption">
            Patient conversations <ArrowRight size={13} />
          </span>
        </Link>
      </div>
      <div className="dashboard-main-grid doctor-dashboard-grid">
        <section className="dashboard-section">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Today</p>
              <h2>Today's schedule</h2>
            </div>
            <Link className="text-link" to="/appointments">
              All appointments <ArrowRight size={14} />
            </Link>
          </div>
          {todayAppts.length ? (
            <div className="appointment-list">
              {todayAppts.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  showPatient
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays size={22} />
              <p>No appointments scheduled for today.</p>
            </div>
          )}
          <div className="section-title-row recent-activity-heading">
            <div>
              <p className="eyebrow">Latest records</p>
              <h2>Recent appointment activity</h2>
            </div>
          </div>
          {recentAppointments.length ? (
            <div className="recent-activity-list">
              {recentAppointments.map((appointment) => (
                <Link
                  className="activity-row"
                  to={`/appointments/${appointment.id}`}
                  key={appointment.id}
                >
                  <span className="activity-avatar">
                    {appointment.patient_name?.slice(0, 1)?.toUpperCase()}
                  </span>
                  <span className="activity-main">
                    <strong>{appointment.patient_name}</strong>
                    <span>
                      {appointment.appointment_date} ·{" "}
                      {appointment.start_time?.slice(0, 5)}
                    </span>
                  </span>
                  <span className={`badge badge-${appointment.status}`}>
                    {appointment.status}
                  </span>
                  <ArrowRight size={14} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              Patient activity will appear with appointments.
            </div>
          )}
        </section>
        <aside className="dashboard-side-column">
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Record processing</p>
                <h2>Document activity</h2>
              </div>
              <Link className="text-link" to="/documents">
                View records <ArrowRight size={14} />
              </Link>
            </div>
            {documentActivity.length ? (
              documentActivity.slice(0, 4).map((document) => (
                <div className="document-activity-row" key={document.id}>
                  <FileText size={16} />
                  <span>
                    <strong>{document.file_name}</strong>
                    <small>{document.ai_processing_status}</small>
                  </span>
                  <span
                    className={`badge badge-${document.ai_processing_status}`}
                  >
                    {document.ai_processing_status}
                  </span>
                </div>
              ))
            ) : (
              <div className="empty-state compact-empty">
                No pending document processing.
              </div>
            )}
          </section>
          <section className="dashboard-shortcuts">
            <Link to="/documents">
              <FileText size={17} />
              <span>
                <strong>Patient records</strong>
                <small>Access records shared through your care</small>
              </span>
              <ArrowRight size={14} />
            </Link>
            <Link to="/chat">
              <MessageCircle size={17} />
              <span>
                <strong>Secure messages</strong>
                <small>Continue patient conversations</small>
              </span>
              <ArrowRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
