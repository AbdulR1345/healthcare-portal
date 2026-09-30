import { ArrowRight, MapPin, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";

export default function DoctorCard({ doctor }) {
  const fee =
    doctor.fee == null
      ? "Fee not listed"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "USD",
        }).format(doctor.fee);

  return (
    <article className="doctor-card">
      <div className="doctor-card-main">
        <span className="doctor-avatar">
          <Stethoscope size={22} />
        </span>
        <div className="doctor-card-copy">
          <h2>{doctor.full_name}</h2>
          <p className="doctor-specialty">{doctor.specialization}</p>
        </div>
      </div>
      <p className="doctor-location">
        <MapPin size={15} /> {doctor.location || "Location not listed"}
      </p>
      <div className="doctor-facts">
        <span>{fee}</span>
        {doctor.experience_years != null && (
          <span>{doctor.experience_years} years' experience</span>
        )}
        {doctor.languages?.length > 0 && (
          <span>{doctor.languages.join(", ")}</span>
        )}
      </div>
      {doctor.bio && (
        <p className="doctor-bio">
          {doctor.bio.slice(0, 150)}
          {doctor.bio.length > 150 ? "…" : ""}
        </p>
      )}
      <div className="doctor-card-actions">
        <Link to={`/doctors/${doctor.id}`} className="button button-secondary">
          View profile <ArrowRight size={15} />
        </Link>
        <Link to={`/book/${doctor.id}`} className="button button-primary">
          Book appointment
        </Link>
      </div>
    </article>
  );
}
