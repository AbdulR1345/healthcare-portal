import { CalendarDays, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

export default function AppointmentCard({
  appointment,
  onStatusChange,
  showPatient,
  updating = false,
}) {
  const formatDate = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const actions = showPatient
    ? appointment.status === "scheduled"
      ? [
          ["confirmed", "Confirm"],
          ["cancelled", "Cancel"],
        ]
      : appointment.status === "confirmed"
        ? [
            ["completed", "Complete"],
            ["cancelled", "Cancel"],
          ]
        : []
    : ["scheduled", "confirmed"].includes(appointment.status)
      ? [["cancelled", "Cancel"]]
      : [];

  return (
    <article className="appointment-card">
      <div className="appointment-topline">
        <div>
          <p className="appointment-overline">
            {showPatient ? "Patient" : "Appointment"}
          </p>
          <h3>
            {showPatient ? appointment.patient_name : appointment.doctor_name}
          </h3>
          {appointment.specialization && (
            <p className="appointment-specialty">
              {appointment.specialization}
            </p>
          )}
        </div>
        <span className={`badge badge-${appointment.status}`}>
          {appointment.status}
        </span>
      </div>
      <div className="appointment-facts">
        <span>
          <CalendarDays size={15} /> {formatDate(appointment.appointment_date)}
        </span>
        <span>
          <Clock3 size={15} /> {appointment.start_time?.slice(0, 5)}–
          {appointment.end_time?.slice(0, 5)}
        </span>
        {appointment.location && (
          <span>
            <MapPin size={15} /> {appointment.location}
          </span>
        )}
      </div>
      <footer className="appointment-actions">
        <Link to={`/appointments/${appointment.id}`} className="text-link">
          View details
        </Link>
        {onStatusChange &&
          actions.map(([status, label]) => (
            <button
              key={status}
              className={`button button-small ${status === "cancelled" ? "button-danger" : "button-secondary"}`}
              disabled={updating}
              onClick={() => onStatusChange(appointment.id, status)}
            >
              {label}
            </button>
          ))}
      </footer>
    </article>
  );
}
