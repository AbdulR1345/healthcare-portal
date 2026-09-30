import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  MapPin,
  Stethoscope,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api";

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function DoctorProfile() {
  const { doctorId } = useParams();
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.doctors
      .getById(doctorId)
      .then(setDoctor)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [doctorId]);

  if (loading)
    return (
      <div className="page-loader" role="status">
        Loading clinician profile
      </div>
    );

  if (error || !doctor)
    return (
      <main className="container">
        <div className="alert alert-error" role="alert">
          {error || "Clinician not found."}
        </div>
        <Link className="button button-secondary" to="/doctors">
          <ArrowLeft size={15} /> Back to search
        </Link>
      </main>
    );

  const availability = [...(doctor.availability || [])].sort(
    (a, b) =>
      a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
  const fee =
    doctor.fee == null
      ? "Not listed"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "USD",
        }).format(doctor.fee);

  return (
    <main className="container doctor-profile-page">
      <Link className="back-link" to="/doctors">
        <ArrowLeft size={15} /> Back to clinicians
      </Link>
      <section className="doctor-profile-hero">
        <span className="doctor-profile-avatar">
          <Stethoscope size={30} />
        </span>
        <div className="doctor-profile-name">
          <p className="eyebrow">Clinician profile</p>
          <h1>{doctor.full_name}</h1>
          <p>{doctor.specialization}</p>
        </div>
        <Link
          className="button button-primary profile-book-button"
          to={`/book/${doctor.id}`}
        >
          Book appointment <CalendarDays size={16} />
        </Link>
      </section>
      <div className="doctor-profile-grid">
        <section className="profile-panel">
          <h2>About</h2>
          {doctor.bio ? (
            <p className="profile-bio">{doctor.bio}</p>
          ) : (
            <p className="muted">No biography has been provided.</p>
          )}
          <dl className="doctor-facts-list">
            <div>
              <dt>
                <MapPin size={15} /> Location
              </dt>
              <dd>{doctor.location || "Not listed"}</dd>
            </div>
            <div>
              <dt>Consultation fee</dt>
              <dd>{fee}</dd>
            </div>
            {doctor.experience_years != null && (
              <div>
                <dt>Experience</dt>
                <dd>{doctor.experience_years} years</dd>
              </div>
            )}
            {doctor.languages?.length > 0 && (
              <div>
                <dt>Languages</dt>
                <dd>{doctor.languages.join(", ")}</dd>
              </div>
            )}
          </dl>
        </section>
        <aside className="availability-panel">
          <h2>
            <Clock3 size={18} /> Regular availability
          </h2>
          {availability.length ? (
            <ul>
              {availability.map((item) => (
                <li key={item.id || `${item.day_of_week}-${item.start_time}`}>
                  <span>{dayNames[item.day_of_week]}</span>
                  <strong>
                    {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No regular hours listed. Check the booking calendar for available
              dates.
            </p>
          )}
          <Link className="button button-primary" to={`/book/${doctor.id}`}>
            Choose a time <CalendarDays size={15} />
          </Link>
        </aside>
      </div>
    </main>
  );
}
