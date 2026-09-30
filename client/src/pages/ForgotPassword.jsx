import { useState } from "react";
import { ArrowLeft, HeartPulse, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await api.auth.forgotPassword(email.trim());
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
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
          <p className="eyebrow">Account security</p>
          <h1>Get back to your care workspace.</h1>
          <p>
            We'll send a reset link if the address is connected to a verified
            account.
          </p>
          <div className="auth-privacy">
            <LockKeyhole size={16} /> Reset links expire after one hour
          </div>
        </div>
        <p className="auth-aside-foot">Carepath is not for emergency use.</p>
      </aside>
      <section className="auth-content">
        <div className="auth-form-wrap">
          <Link to="/login" className="back-link">
            <ArrowLeft size={15} /> Back to sign in
          </Link>
          <p className="eyebrow">Password recovery</p>
          <h2>Reset your password</h2>
          <p className="auth-intro">
            Enter your account email. For privacy, the response is the same
            whether or not the address is registered.
          </p>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {message ? (
            <div className="alert alert-success" role="status">
              {message}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <button
                className="button button-primary auth-submit"
                type="submit"
                disabled={loading || !email.trim()}
              >
                {loading ? "Sending request..." : "Send reset link"}
              </button>
            </form>
          )}
          <p className="auth-switch">
            Remember your password? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
