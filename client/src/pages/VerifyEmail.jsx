import { useEffect, useRef, useState } from "react";
import { Check, HeartPulse, LockKeyhole, MailCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../services/api";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const initialEmail = searchParams.get("email") || "";
  const started = useRef(false);
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState(token ? "verifying" : "pending");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.auth
      .verifyEmail(token)
      .then((result) => {
        setMessage(result.message);
        setStatus("verified");
      })
      .catch((requestError) => {
        setError(requestError.message);
        setStatus("invalid");
      });
  }, [token]);

  const handleResend = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setResending(true);
    try {
      const result = await api.auth.resendVerification(email.trim());
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="auth-layout auth-short-layout">
      <aside className="auth-aside">
        <Link to="/" className="auth-brand">
          <span className="brand-mark">
            <HeartPulse size={18} />
          </span>{" "}
          carepath<span className="brand-period">.</span>
        </Link>
        <div className="auth-aside-copy">
          <p className="eyebrow">Account verification</p>
          <h1>Confirm your email when convenient.</h1>
          <p>
            Email verification is optional. You can sign in to your healthcare
            workspace without verifying your address.
          </p>
          <div className="auth-privacy">
            <LockKeyhole size={16} /> Verification links expire after 24 hours
          </div>
        </div>
        <p className="auth-aside-foot">Carepath is not for emergency use.</p>
      </aside>
      <section className="auth-content">
        <div className="auth-form-wrap">
          <span
            className={`auth-status-icon ${status === "verified" ? "is-success" : ""}`}
          >
            {status === "verified" ? (
              <Check size={23} />
            ) : (
              <MailCheck size={23} />
            )}
          </span>
          <p className="eyebrow">Email verification</p>
          <h2>
            {status === "verifying"
              ? "Verifying your email"
              : status === "verified"
                ? "Email verified"
                : status === "invalid"
                  ? "Link needs attention"
                  : "Check your inbox"}
          </h2>
          {status === "verifying" && (
            <p className="auth-intro" role="status">
              Confirming your email address...
            </p>
          )}
          {status === "verified" && (
            <>
              <p className="auth-intro">{message}</p>
              <Link className="button button-primary auth-submit" to="/login">
                Continue to sign in
              </Link>
            </>
          )}
          {status === "pending" && (
            <>
              <p className="auth-intro">
                If you want to verify your address, use the link we sent or
                request another message below. Verification is not required to
                sign in.
              </p>
              {message && (
                <div className="alert alert-success" role="status">
                  {message}
                </div>
              )}
              <form onSubmit={handleResend}>
                <div className="form-group">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <button
                  className="button button-primary auth-submit"
                  type="submit"
                  disabled={resending || !email.trim()}
                >
                  {resending ? "Sending..." : "Resend verification email"}
                </button>
              </form>
            </>
          )}
          {status === "invalid" && (
            <>
              <div className="alert alert-error" role="alert">
                {error}
              </div>
              <p className="auth-intro">
                Request a fresh verification email, or sign in without
                verifying your address.
              </p>
              <form onSubmit={handleResend}>
                <div className="form-group">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <button
                  className="button button-primary auth-submit"
                  type="submit"
                  disabled={resending || !email.trim()}
                >
                  {resending ? "Sending..." : "Send a new link"}
                </button>
              </form>
            </>
          )}
          <p className="auth-switch">
            Already verified? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
