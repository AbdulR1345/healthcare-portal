import { useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function Settings() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .profile()
      .then(setProfile)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container settings-page">
      <header className="page-heading">
        <p className="eyebrow">Account</p>
        <h1>Settings</h1>
        <p>Security and account access.</p>
      </header>
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="skeleton settings-skeleton" />
      ) : (
        <div className="settings-list">
          <section className="settings-row">
            <span className="settings-icon">
              <Mail size={18} />
            </span>
            <div>
              <h2>Email verification</h2>
              <p>{profile?.email || user.email}</p>
            </div>
            <span
              className={`settings-status ${profile?.email_verified ? "is-good" : ""}`}
            >
              {profile?.email_verified ? (
                <>
                  <CheckCircle2 size={15} /> Verified
                </>
              ) : (
                "Optional"
              )}
            </span>
          </section>
          <section className="settings-row">
            <span className="settings-icon">
              <LockKeyhole size={18} />
            </span>
            <div>
              <h2>Sign-in security</h2>
              <p>
                Short-lived access tokens with secure, HttpOnly refresh
                sessions.
              </p>
            </div>
            <span className="settings-status is-good">
              <ShieldCheck size={15} /> Protected
            </span>
          </section>
          <section className="settings-row">
            <span className="settings-icon">
              <KeyRound size={18} />
            </span>
            <div>
              <h2>Password</h2>
              <p>
                Request a secure password reset link to your verified email.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="button button-secondary button-small"
            >
              Reset password
            </Link>
          </section>
          <section className="settings-row">
            <span className="settings-icon">
              <LockKeyhole size={18} />
            </span>
            <div>
              <h2>Sign out</h2>
              <p>End this session on the current device.</p>
            </div>
            <button
              className="button button-secondary button-small"
              onClick={() => logout()}
            >
              Sign out
            </button>
          </section>
        </div>
      )}
      <p className="disclaimer">
        Profile changes, notification preferences, and session management
        controls are not available through the current account API.
      </p>
    </main>
  );
}
