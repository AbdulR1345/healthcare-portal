import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  RefreshCw,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = () => {
    setLoading(true);
    setError("");
    Promise.all([
      api.admin.stats(),
      api.appointments.list(),
      api.documents.list(),
    ])
      .then(([statsData, appointmentData, documentData]) => {
        setStats(statsData);
        setAppointments(appointmentData);
        setDocuments(documentData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

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
  if (error || !stats)
    return (
      <main className="container">
        <div className="alert alert-error" role="alert">
          {error || "Unable to load platform data."}
        </div>
        <button className="button button-secondary" onClick={loadDashboard}>
          <RefreshCw size={15} /> Try again
        </button>
      </main>
    );

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const upcomingAppointments = appointments
    .filter(
      (appointment) =>
        ["scheduled", "confirmed"].includes(appointment.status) &&
        appointment.appointment_date >= todayKey,
    )
    .sort((a, b) =>
      `${a.appointment_date}${a.start_time}`.localeCompare(
        `${b.appointment_date}${b.start_time}`,
      ),
    )
    .slice(0, 6);
  const activeDocuments = documents.filter((document) =>
    ["pending", "processing", "failed"].includes(document.ai_processing_status),
  );

  return (
    <main className="container dashboard-page admin-dashboard">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Platform overview</h1>
          <p>Current account, appointment, and document activity.</p>
        </div>
        <button className="button button-secondary" onClick={loadDashboard}>
          <RefreshCw size={15} /> Refresh data
        </button>
      </header>
      <div className="dashboard-stat-grid">
        <Link to="/appointments" className="dashboard-stat">
          <span className="stat-icon">
            <Users size={18} />
          </span>
          <span className="stat-label">Patients</span>
          <strong>{stats.totalPatients}</strong>
          <span className="stat-caption">Registered accounts</span>
        </Link>
        <div className="dashboard-stat">
          <span className="stat-icon">
            <Users size={18} />
          </span>
          <span className="stat-label">Clinicians</span>
          <strong>{stats.totalDoctors}</strong>
          <span className="stat-caption">Directory listings</span>
        </div>
        <Link to="/appointments" className="dashboard-stat">
          <span className="stat-icon">
            <CalendarDays size={18} />
          </span>
          <span className="stat-label">Appointments</span>
          <strong>{stats.totalAppointments}</strong>
          <span className="stat-caption">All recorded appointments</span>
        </Link>
      </div>
      <div className="admin-operations-grid">
        <section className="dashboard-section">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Scheduling</p>
              <h2>Upcoming appointments</h2>
            </div>
            <Link className="text-link" to="/appointments">
              Full overview <ArrowRight size={14} />
            </Link>
          </div>
          {upcomingAppointments.length ? (
            <div className="admin-appointment-list">
              {upcomingAppointments.map((appointment) => (
                <Link
                  to={`/appointments/${appointment.id}`}
                  className="admin-appointment-row"
                  key={appointment.id}
                >
                  <span className="admin-date-block">
                    <strong>
                      {new Date(
                        `${appointment.appointment_date}T12:00:00`,
                      ).toLocaleDateString(undefined, { day: "2-digit" })}
                    </strong>
                    <small>
                      {new Date(
                        `${appointment.appointment_date}T12:00:00`,
                      ).toLocaleDateString(undefined, { month: "short" })}
                    </small>
                  </span>
                  <span className="admin-appointment-copy">
                    <strong>
                      {appointment.patient_name} <span>with</span>{" "}
                      {appointment.doctor_name}
                    </strong>
                    <small>
                      {appointment.start_time?.slice(0, 5)} ·{" "}
                      {appointment.specialization}
                    </small>
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
              No scheduled appointments in the current data.
            </div>
          )}
        </section>
        <aside className="dashboard-side-column">
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Records</p>
                <h2>Document processing</h2>
              </div>
              <Link className="text-link" to="/documents">
                All documents <ArrowRight size={14} />
              </Link>
            </div>
            <div className="document-count-row">
              <span>
                <FileText size={16} /> Documents in queue
              </span>
              <strong>{activeDocuments.length}</strong>
            </div>
            {activeDocuments.length ? (
              activeDocuments.slice(0, 5).map((document) => (
                <div className="document-activity-row" key={document.id}>
                  <FileText size={16} />
                  <span>
                    <strong>{document.file_name}</strong>
                    <small>
                      {new Date(document.uploaded_at).toLocaleDateString()}
                    </small>
                  </span>
                  <span
                    className={`badge badge-${document.ai_processing_status}`}
                  >
                    {document.ai_processing_status}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted text-small">
                No documents are awaiting processing.
              </p>
            )}
          </section>
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Utilization</p>
                <h2>Appointment completion</h2>
              </div>
            </div>
            <div className="completion-summary">
              <strong>{stats.completionRate}%</strong>
              <span>
                {stats.completedAppointments} of {stats.totalAppointments}{" "}
                completed
              </span>
            </div>
            <div
              className="completion-track"
              role="img"
              aria-label={`${stats.completionRate}% of recorded appointments completed`}
            >
              <span
                style={{
                  width: `${Math.min(100, Math.max(0, stats.completionRate))}%`,
                }}
              />
            </div>
          </section>
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Directory mix</p>
                <h2>Popular specialties</h2>
              </div>
            </div>
            {stats.popularSpecializations?.length ? (
              <ul className="specialty-list">
                {stats.popularSpecializations.map((item) => (
                  <li key={item.specialization}>
                    <span>{item.specialization}</span>
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted text-small">No specialty data available.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
