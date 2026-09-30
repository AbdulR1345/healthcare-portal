import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Search,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";

export default function Patients() {
  const { patientId } = useParams();
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPatients = () => {
    setLoading(true);
    setError("");
    Promise.all([api.appointments.list(), api.documents.list()])
      .then(([appointmentData, documentData]) => {
        setAppointments(appointmentData);
        setDocuments(documentData);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const patients = useMemo(() => {
    const unique = new Map();
    appointments.forEach((appointment) => {
      if (!unique.has(appointment.patient_id))
        unique.set(appointment.patient_id, {
          id: appointment.patient_id,
          full_name: appointment.patient_name,
          email: appointment.patient_email,
          appointments: [],
        });
      unique.get(appointment.patient_id).appointments.push(appointment);
    });
    return [...unique.values()].sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );
  }, [appointments]);

  if (loading)
    return (
      <div className="page-loader" role="status">
        Loading patient records
      </div>
    );
  if (error)
    return (
      <main className="container">
        <div className="alert alert-error" role="alert">
          {error}
        </div>
        <button className="button button-secondary" onClick={loadPatients}>
          Try again
        </button>
      </main>
    );

  if (patientId) {
    const patient = patients.find((item) => item.id === patientId);
    if (!patient)
      return (
        <main className="container">
          <header className="page-heading">
            <p className="eyebrow">Care team</p>
            <h1>Patient not found</h1>
            <p>No patient record was returned for this care relationship.</p>
          </header>
          <Link className="button button-secondary" to="/patients">
            <ArrowLeft size={15} /> Patient list
          </Link>
        </main>
      );
    const patientDocuments = documents.filter(
      (document) => document.patient_id === patientId,
    );
    return (
      <main className="container patient-detail-page">
        <Link className="back-link" to="/patients">
          <ArrowLeft size={15} /> All patients
        </Link>
        <header className="dashboard-welcome">
          <div>
            <p className="eyebrow">Patient record</p>
            <h1>{patient.full_name}</h1>
            <p>{patient.email || "Email not included in appointment record"}</p>
          </div>
          <span className="profile-avatar">
            <UserRound size={24} />
          </span>
        </header>
        <div className="patient-record-grid">
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Schedule</p>
                <h2>Appointments</h2>
              </div>
              <span className="badge">
                {patient.appointments.length} records
              </span>
            </div>
            <div className="patient-appointments">
              {[...patient.appointments]
                .sort((a, b) =>
                  `${b.appointment_date}${b.start_time}`.localeCompare(
                    `${a.appointment_date}${a.start_time}`,
                  ),
                )
                .map((appointment) => (
                  <Link
                    to={`/appointments/${appointment.id}`}
                    className="patient-appointment-row"
                    key={appointment.id}
                  >
                    <span>
                      <strong>
                        {new Date(
                          `${appointment.appointment_date}T12:00:00`,
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
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
          </section>
          <section className="dashboard-section">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Shared records</p>
                <h2>Medical documents</h2>
              </div>
              <FileText size={17} />
            </div>
            {patientDocuments.length ? (
              patientDocuments.map((document) => (
                <Link
                  to="/documents"
                  className="recent-document"
                  key={document.id}
                >
                  <span className="document-file-icon">
                    <FileText size={16} />
                  </span>
                  <span className="recent-document-copy">
                    <strong>{document.file_name}</strong>
                    <span>
                      {document.ai_processing_status || "pending"} ·{" "}
                      {new Date(document.uploaded_at).toLocaleDateString()}
                    </span>
                  </span>
                  <ArrowRight size={14} />
                </Link>
              ))
            ) : (
              <div className="empty-state compact-empty">
                No documents are available for this patient.
              </div>
            )}
            <p className="disclaimer">
              Records are limited to patients in your care relationships.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visiblePatients = patients.filter((patient) =>
    `${patient.full_name} ${patient.email || ""}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  return (
    <main className="container patients-page">
      <header className="page-heading">
        <p className="eyebrow">Clinician workspace</p>
        <h1>Patients</h1>
        <p>Patients with appointments in your care records.</p>
      </header>
      <div className="patient-search">
        <Search size={17} />
        <label className="sr-only" htmlFor="patient-search">
          Search patients
        </label>
        <input
          id="patient-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
        />
      </div>
      {visiblePatients.length ? (
        <div className="patients-list">
          {visiblePatients.map((patient) => (
            <Link
              to={`/patients/${patient.id}`}
              className="patient-list-row"
              key={patient.id}
            >
              <span className="activity-avatar">
                {patient.full_name?.slice(0, 1)?.toUpperCase()}
              </span>
              <span className="patient-list-main">
                <strong>{patient.full_name}</strong>
                <span>
                  {patient.email || "Email not listed"} ·{" "}
                  {patient.appointments.length} appointment
                  {patient.appointments.length === 1 ? "" : "s"}
                </span>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          {patients.length
            ? "No patients match your search."
            : "Patient records will appear when appointments are created."}
        </div>
      )}
    </main>
  );
}
