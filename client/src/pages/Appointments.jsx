import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, notifyAppointmentsChanged } from "../services/api";
import AppointmentCard from "../components/Appointment";

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Appointments() {
  const { appointmentId } = useParams();
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [updating, setUpdating] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadAppointments = () => {
    setLoading(true);
    setError("");
    api.appointments
      .list()
      .then((result) => setAppointments(Array.isArray(result) ? result : []))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  useEffect(() => {
    const refreshAppointments = () => {
      api.appointments
        .list()
        .then((result) => setAppointments(Array.isArray(result) ? result : []))
        .catch((requestError) => setActionError(requestError.message));
    };
    window.addEventListener("appointments:changed", refreshAppointments);
    return () =>
      window.removeEventListener("appointments:changed", refreshAppointments);
  }, []);

  const appointment = appointmentId
    ? appointments.find((item) => item.id === appointmentId)
    : null;
  const today = new Date().toLocaleDateString("en-CA");
  const visibleAppointments = useMemo(
    () =>
      appointments.filter((item) => {
        if (filter === "upcoming")
          return (
            ["scheduled", "confirmed"].includes(item.status) &&
            item.appointment_date >= today
          );
        if (filter === "past")
          return (
            ["scheduled", "confirmed"].includes(item.status) &&
            item.appointment_date < today
          );
        if (filter === "completed") return item.status === "completed";
        if (filter === "cancelled") return item.status === "cancelled";
        return true;
      }),
    [appointments, filter, today],
  );

  useEffect(() => {
    if (!rescheduleDate || !appointment || !rescheduling) return;
    let active = true;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setRescheduleSlots([]);
    setActionError("");
    api.doctors
      .getSlots(appointment.doctor_id, rescheduleDate)
      .then((result) => {
        if (active) setRescheduleSlots(result.slots || []);
      })
      .catch((requestError) => {
        if (active) setActionError(requestError.message);
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appointment, rescheduleDate, rescheduling]);

  const changeStatus = async (id, status) => {
    if (
      status === "cancelled" &&
      !window.confirm("Cancel this appointment? This action cannot be undone.")
    ) {
      return;
    }
    setUpdating(true);
    setActionError("");
    try {
      const updated = await api.appointments.updateStatus(id, status);
      setAppointments((current) =>
        current.map((item) =>
          item.id === id ? { ...item, ...updated } : item,
        ),
      );
      notifyAppointmentsChanged();
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setUpdating(false);
    }
  };

  const saveReschedule = async () => {
    if (!appointment || !selectedSlot) return;
    setUpdating(true);
    setActionError("");
    try {
      const updated = await api.appointments.reschedule(appointment.id, {
        appointmentDate: rescheduleDate,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
      });
      setAppointments((current) =>
        current.map((item) =>
          item.id === appointment.id ? { ...item, ...updated } : item,
        ),
      );
      notifyAppointmentsChanged();
      setRescheduling(false);
      setRescheduleDate("");
      setRescheduleSlots([]);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setUpdating(false);
    }
  };

  if (loading)
    return (
      <div className="page-loader" role="status">
        Loading appointments
      </div>
    );
  if (error)
    return (
      <main className="container">
        <div className="alert alert-error" role="alert">
          {error}
        </div>
        <button className="button button-secondary" onClick={loadAppointments}>
          <RefreshCw size={15} /> Try again
        </button>
      </main>
    );

  if (appointmentId) {
    if (!appointment)
      return (
        <main className="container">
          <header className="page-heading">
            <p className="eyebrow">Appointments</p>
            <h1>Appointment not found</h1>
            <p>This appointment may no longer be available in your account.</p>
          </header>
          <Link className="button button-secondary" to="/appointments">
            <ArrowLeft size={15} /> All appointments
          </Link>
        </main>
      );
    const showPatient = user.role === "doctor" || user.role === "admin";
    const canReschedule =
      ["patient", "admin"].includes(user.role) &&
      ["scheduled", "confirmed"].includes(appointment.status);
    const canCancel =
      ["scheduled", "confirmed"].includes(appointment.status) &&
      user.role !== "admin";
    const canConfirm = showPatient && appointment.status === "scheduled";
    const canComplete = showPatient && appointment.status === "confirmed";

    return (
      <main className="container appointment-detail-page">
        <Link className="back-link" to="/appointments">
          <ArrowLeft size={15} /> All appointments
        </Link>
        <header className="page-heading">
          <p className="eyebrow">Appointment details</p>
          <h1>
            {showPatient ? appointment.patient_name : appointment.doctor_name}
          </h1>
          <p>
            {appointment.specialization || "Care visit"} ·{" "}
            {appointment.location || "Location not listed"}
          </p>
        </header>
        {actionError && (
          <div className="alert alert-error" role="alert">
            {actionError}
          </div>
        )}
        <div className="appointment-detail-grid">
          <section className="profile-panel">
            <div className="appointment-detail-status">
              <span className={`badge badge-${appointment.status}`}>
                {appointment.status}
              </span>
            </div>
            <div className="appointment-detail-facts">
              <div>
                <span>
                  <CalendarDays size={17} /> Date
                </span>
                <strong>{formatDate(appointment.appointment_date)}</strong>
              </div>
              <div>
                <span>
                  <Clock3 size={17} /> Time
                </span>
                <strong>
                  {appointment.start_time?.slice(0, 5)}–
                  {appointment.end_time?.slice(0, 5)}
                </strong>
              </div>
              <div>
                <span>
                  <UserRound size={17} />{" "}
                  {showPatient ? "Clinician" : "Clinician"}
                </span>
                <strong>{appointment.doctor_name}</strong>
              </div>
            </div>
            {appointment.notes && (
              <div className="appointment-notes">
                <h3>Visit notes</h3>
                <p>{appointment.notes}</p>
              </div>
            )}
            <div className="appointment-detail-actions">
              {canConfirm && (
                <button
                  className="button button-primary"
                  disabled={updating}
                  onClick={() => changeStatus(appointment.id, "confirmed")}
                >
                  Confirm appointment
                </button>
              )}
              {canComplete && (
                <button
                  className="button button-primary"
                  disabled={updating}
                  onClick={() => changeStatus(appointment.id, "completed")}
                >
                  Mark completed
                </button>
              )}
              {canReschedule && (
                <button
                  className="button button-secondary"
                  disabled={updating}
                  onClick={() => setRescheduling((current) => !current)}
                >
                  <RefreshCw size={15} />{" "}
                  {rescheduling ? "Close reschedule" : "Reschedule"}
                </button>
              )}
              {canCancel && (
                <button
                  className="button button-danger"
                  disabled={updating}
                  onClick={() => changeStatus(appointment.id, "cancelled")}
                >
                  Cancel appointment
                </button>
              )}
            </div>
            {rescheduling && (
              <section className="reschedule-panel">
                <h2>Choose a new time</h2>
                <div className="form-group">
                  <label htmlFor="reschedule-date">New date</label>
                  <input
                    id="reschedule-date"
                    type="date"
                    min={new Date().toLocaleDateString("en-CA")}
                    value={rescheduleDate}
                    onChange={(event) => {
                      setRescheduleDate(event.target.value);
                      setSelectedSlot(null);
                      setRescheduleSlots([]);
                    }}
                  />
                </div>
                {slotsLoading && (
                  <p className="muted" role="status">
                    Finding available times...
                  </p>
                )}
                {rescheduleDate && !slotsLoading && (
                  <div className="slot-picker">
                    {rescheduleSlots.length ? (
                      rescheduleSlots.map((slot) => (
                        <button
                          key={slot.startTime}
                          className={`slot-button ${selectedSlot?.startTime === slot.startTime ? "is-selected" : ""}`}
                          type="button"
                          disabled={slot.available === false}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {slot.startTime.slice(0, 5)}
                        </button>
                      ))
                    ) : (
                      <p className="muted">No available times on this date.</p>
                    )}
                  </div>
                )}
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!selectedSlot || updating}
                  onClick={saveReschedule}
                >
                  {updating ? "Saving..." : "Confirm new time"}
                </button>
              </section>
            )}
          </section>
        </div>
      </main>
    );
  }

  const showPatient = user.role === "doctor" || user.role === "admin";
  return (
    <main className="container">
      <header className="page-heading">
        <p className="eyebrow">Care schedule</p>
        <h1>
          {user.role === "admin" ? "Appointment overview" : "Appointments"}
        </h1>
        <p>
          {user.role === "admin"
            ? "Review appointment records across the platform."
            : "Review upcoming visits and appointment history."}
        </p>
      </header>
      <div
        className="appointment-filter-tabs"
        role="tablist"
        aria-label="Filter appointments"
      >
        {["upcoming", "past", "completed", "cancelled", "all"].map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "is-active" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "upcoming"
              ? "Upcoming"
              : value === "past"
                ? "Past"
                : value === "completed"
                  ? "Completed"
                  : value === "cancelled"
                    ? "Cancelled"
                    : "All"}
          </button>
        ))}
      </div>
      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}
      {!visibleAppointments.length ? (
        <div className="empty-state">
          {filter === "upcoming"
            ? "No upcoming appointments."
            : `No ${filter === "all" ? "" : `${filter} `}appointments in this view.`}
          {user.role === "patient" && filter === "upcoming" && (
            <p>
              <Link to="/doctors">Find a clinician</Link>
            </p>
          )}
        </div>
      ) : (
        <div className="appointment-list">
          {visibleAppointments.map((item) => (
            <AppointmentCard
              key={item.id}
              appointment={item}
              showPatient={showPatient}
              onStatusChange={changeStatus}
              updating={updating}
            />
          ))}
        </div>
      )}
    </main>
  );
}
