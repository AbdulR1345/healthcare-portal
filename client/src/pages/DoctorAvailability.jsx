import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Info } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function DoctorAvailability() {
  const { user } = useAuth();
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.auth
      .profile()
      .then((profile) => {
        if (!profile.doctor?.id)
          throw new Error("Clinician schedule is unavailable.");
        return api.doctors.getById(profile.doctor.id);
      })
      .then((doctor) => setAvailability(doctor.availability || []))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped = availability.reduce((days, slot) => {
    days[slot.day_of_week] ||= [];
    days[slot.day_of_week].push(slot);
    return days;
  }, {});

  return (
    <main className="container availability-page">
      <header className="page-heading">
        <p className="eyebrow">Clinician workspace</p>
        <h1>Availability</h1>
        <p>
          Current recurring hours used to calculate bookable appointment slots.
        </p>
      </header>
      {loading ? (
        <div className="skeleton settings-skeleton" role="status" />
      ) : error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : (
        <>
          <div className="availability-notice">
            <Info size={17} />
            <p>
              These hours are read-only here. The current API does not provide a
              way to edit clinician availability.
            </p>
          </div>
          {availability.length ? (
            <div className="availability-list">
              {weekdays.map((day, index) =>
                grouped[index]?.length ? (
                  <section className="availability-day" key={day}>
                    <h2>
                      <CalendarDays size={17} /> {day}
                    </h2>
                    <div>
                      {grouped[index].map((slot) => (
                        <span className="availability-slot" key={slot.id}>
                          <Clock3 size={14} /> {slot.start_time.slice(0, 5)}–
                          {slot.end_time.slice(0, 5)}
                          {slot.slot_duration_minutes
                            ? ` · ${slot.slot_duration_minutes} min visits`
                            : ""}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
            </div>
          ) : (
            <div className="empty-state">
              No recurring availability is configured on your account.
            </div>
          )}
        </>
      )}
      <p className="disclaimer">
        {user.full_name
          ? `Schedule for ${user.full_name}.`
          : "Clinician schedule."}{" "}
        Changes require an availability-management API.
      </p>
    </main>
  );
}
