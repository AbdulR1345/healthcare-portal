import { useEffect, useState } from "react";
import {
  CalendarDays,
  CircleCheck,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = () => {
    setLoading(true);
    setError("");
    api.auth
      .profile()
      .then(setProfile)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  if (loading)
    return (
      <div className="page-loader" role="status">
        Loading profile
      </div>
    );

  return (
    <div className="container">
      <header className="page-heading">
        <p className="eyebrow">Account</p>
        <h1>Your profile</h1>
        <p>Account details and sign-in status.</p>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}{" "}
          <button className="text-button" onClick={loadProfile}>
            Try again
          </button>
        </div>
      )}
      {profile && (
        <div className="profile-layout">
          <section className="profile-panel">
            <div className="profile-heading">
              <span className="profile-avatar">
                <UserRound size={24} />
              </span>
              <div>
                <h2>{profile.full_name}</h2>
                <span className="badge">{profile.role}</span>
              </div>
            </div>
            <dl className="profile-details">
              <div>
                <dt>
                  <Mail size={15} /> Email
                </dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt>
                  <Phone size={15} /> Phone
                </dt>
                <dd>{profile.phone || "Not provided"}</dd>
              </div>
              <div>
                <dt>
                  <CircleCheck size={15} /> Email status
                </dt>
                <dd>
                  {profile.email_verified ? "Verified" : "Not verified"}
                </dd>
              </div>
              <div>
                <dt>
                  <CalendarDays size={15} /> Account created
                </dt>
                <dd>
                  {profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString()
                    : "Not available"}
                </dd>
              </div>
              {profile.role === "doctor" && profile.doctor && (
                <>
                  <div>
                    <dt>
                      <Stethoscope size={15} /> Specialty
                    </dt>
                    <dd>{profile.doctor.specialization || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>
                      <MapPin size={15} /> Practice location
                    </dt>
                    <dd>{profile.doctor.location || "Not provided"}</dd>
                  </div>
                  {profile.doctor.fee != null && (
                    <div>
                      <dt>Consultation fee</dt>
                      <dd>
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: "USD",
                        }).format(profile.doctor.fee)}
                      </dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </section>
          <aside className="profile-security">
            <h3>
              <LockKeyhole size={17} /> Account security
            </h3>
            <p>
              Email verification is optional. Sign-in uses protected
              session-based authentication.
            </p>
            <Link to="/forgot-password" className="button button-secondary">
              Reset password
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
