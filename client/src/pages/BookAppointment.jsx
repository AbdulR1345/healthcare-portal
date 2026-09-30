import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";

export default function BookAppointment() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [createdAppointment, setCreatedAppointment] = useState(null);
  const [step, setStep] = useState("schedule");

  useEffect(() => {
    api.doctors
      .getById(doctorId)
      .then(setDoctor)
      .catch(() => setError("Doctor not found"))
      .finally(() => setLoading(false));
  }, [doctorId]);

  useEffect(() => {
    if (!date) return;
    setSlotsLoading(true);
    setError("");
    api.doctors
      .getSlots(doctorId, date)
      .then((data) => setSlots(data.slots || []))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setSlotsLoading(false));
  }, [doctorId, date]);

  const handleBook = async () => {
    if (!selectedSlot || !date) return;
    setBooking(true);
    setError("");

    try {
      const result = await api.appointments.book({
        doctorId,
        appointmentDate: date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        notes,
      });
      setCreatedAppointment(result);
      setStep("success");
    } catch (err) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  };

  const now = new Date();
  const minDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (loading) return <div className="loading">Loading...</div>;
  if (!doctor)
    return (
      <main className="container">
        <div className="alert alert-error" role="alert">
          {error || "Clinician not found."}
        </div>
        <Link to="/doctors" className="button button-secondary">
          <ArrowLeft size={15} /> Back to search
        </Link>
      </main>
    );

  if (step === "success")
    return (
      <main className="container booking-success">
        <span className="success-mark">
          <CheckCircle2 size={30} />
        </span>
        <p className="eyebrow">Request received</p>
        <h1>Appointment requested.</h1>
        <p>
          Your appointment with {doctor.full_name} is scheduled for{" "}
          {new Date(
            `${createdAppointment.appointment_date}T12:00:00`,
          ).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}{" "}
          at {createdAppointment.start_time?.slice(0, 5)}. You can review its
          status from your appointments.
        </p>
        <div className="hero-actions">
          <Link
            className="button button-primary"
            to={
              createdAppointment.id
                ? `/appointments/${createdAppointment.id}`
                : "/appointments"
            }
          >
            View appointment
          </Link>
          <Link className="button button-secondary" to="/appointments">
            All appointments
          </Link>
        </div>
      </main>
    );

  return (
    <main className="container booking-page">
      <Link className="back-link" to={`/doctors/${doctor.id}`}>
        <ArrowLeft size={15} /> Clinician profile
      </Link>
      <header className="page-heading">
        <p className="eyebrow">New appointment</p>
        <h1>Choose a time</h1>
        <p>
          Review availability and request an appointment with this clinician.
        </p>
      </header>
      <div className="booking-progress" aria-label="Booking steps">
        <span className="is-current">
          <b>1</b> Schedule
        </span>
        <span className={selectedSlot ? "is-current" : ""}>
          <b>2</b> Details
        </span>
        <span>
          <b>3</b> Confirmation
        </span>
      </div>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
          {error.toLowerCase().includes("slot") && (
            <span> Choose another available time and try again.</span>
          )}
        </div>
      )}
      <div className="booking-layout">
        <section className="booking-form-panel">
          <div className="booking-section-title">
            <span>01</span>
            <div>
              <h2>Select a date and time</h2>
              <p>
                Available times are based on this clinician's current schedule.
              </p>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="date">Appointment date</label>
            <input
              id="date"
              type="date"
              min={minDate}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSelectedSlot(null);
                setSlots([]);
                setStep("schedule");
              }}
            />
          </div>
          {date && (
            <div className="form-group">
              <label>
                Available times{" "}
                <span className="selected-date-label">
                  {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </label>
              {slotsLoading ? (
                <div className="slots-loading" role="status">
                  Loading available times...
                </div>
              ) : slots.length === 0 && !error ? (
                <div className="empty-state compact-empty">
                  No available times on this date. Try another date.
                </div>
              ) : (
                <div className="slot-picker">
                  {slots.map((slot) => (
                    <button
                      key={`${slot.startTime}-${slot.endTime}`}
                      type="button"
                      className={`slot-button ${selectedSlot?.startTime === slot.startTime ? "is-selected" : ""}`}
                      disabled={slot.available === false}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStep("details");
                        setError("");
                      }}
                    >
                      {slot.startTime.slice(0, 5)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div
            className={`booking-details ${selectedSlot ? "is-enabled" : ""}`}
          >
            <div className="booking-section-title">
              <span>02</span>
              <div>
                <h2>Visit details</h2>
                <p>Share anything that may help prepare for the appointment.</p>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="notes">
                Notes for the clinician{" "}
                <span className="optional-label">Optional</span>
              </label>
              <textarea
                id="notes"
                rows={4}
                maxLength={5000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add a brief note about the reason for your visit"
              />
            </div>
          </div>
          <button
            className="button button-primary booking-submit"
            disabled={!selectedSlot || booking}
            onClick={handleBook}
          >
            {booking
              ? "Requesting appointment..."
              : "Confirm appointment request"}{" "}
            <CheckCircle2 size={16} />
          </button>
          <p className="booking-privacy">
            <ShieldCheck size={14} /> Your request is sent securely. The
            clinician can confirm it from their schedule.
          </p>
        </section>
        <aside className="booking-summary">
          <p className="eyebrow">Your clinician</p>
          <div className="booking-doctor">
            <span className="doctor-avatar">
              <CalendarDays size={20} />
            </span>
            <div>
              <strong>{doctor.full_name}</strong>
              <span>{doctor.specialization}</span>
            </div>
          </div>
          <p className="booking-summary-location">
            <MapPin size={15} /> {doctor.location || "Location not listed"}
          </p>
          <div className="booking-summary-rule" />
          <div className="booking-summary-row">
            <span>
              <CalendarDays size={15} /> Date
            </span>
            <strong>
              {date
                ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Choose a date"}
            </strong>
          </div>
          <div className="booking-summary-row">
            <span>
              <Clock3 size={15} /> Time
            </span>
            <strong>
              {selectedSlot
                ? `${selectedSlot.startTime.slice(0, 5)}–${selectedSlot.endTime.slice(0, 5)}`
                : "Choose an available time"}
            </strong>
          </div>
          <div className="booking-summary-rule" />
          <div className="booking-summary-row">
            <span>Consultation fee</span>
            <strong>
              {doctor.fee == null
                ? "Not listed"
                : new Intl.NumberFormat(undefined, {
                    style: "currency",
                    currency: "USD",
                  }).format(doctor.fee)}
            </strong>
          </div>
        </aside>
      </div>
    </main>
  );
}
