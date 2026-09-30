import { useMemo, useState } from "react";
import { Eye, EyeOff, HeartPulse, LockKeyhole } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../services/api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const strength = useMemo(
    () =>
      [
        password.length >= 12,
        /[a-z]/.test(password) && /[A-Z]/.test(password),
        /\d/.test(password),
        /[^a-zA-Z0-9]/.test(password),
      ].filter(Boolean).length,
    [password],
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!token)
      return setError(
        "This reset link is missing its security token. Request a new one.",
      );
    if (password !== confirmPassword)
      return setError("Passwords do not match.");
    setLoading(true);
    try {
      await api.auth.resetPassword({ token, password, confirmPassword });
      setComplete(true);
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
          <h1>A password only you know.</h1>
          <p>Choose a unique password to protect your healthcare workspace.</p>
          <div className="auth-privacy">
            <LockKeyhole size={16} /> Reset links can only be used once
          </div>
        </div>
        <p className="auth-aside-foot">Carepath is not for emergency use.</p>
      </aside>
      <section className="auth-content">
        <div className="auth-form-wrap">
          <p className="eyebrow">Password recovery</p>
          <h2>{complete ? "Password updated" : "Choose a new password"}</h2>
          <p className="auth-intro">
            {complete
              ? "Your password has been changed. Sign in with your new credentials."
              : "Use at least 12 characters and avoid passwords that are easy to guess."}
          </p>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {complete ? (
            <Link className="button button-primary auth-submit" to="/login">
              Continue to sign in
            </Link>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="password">New password</label>
                <div className="password-control">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <div className="strength-meter" aria-live="polite">
                  <span className={`strength-bar strength-${strength}`} />
                  <span>
                    {password.length
                      ? strength >= 3
                        ? "Strong password"
                        : "Use a longer mix of characters"
                      : "At least 12 characters"}
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <div className="password-control">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    maxLength={72}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowConfirm((visible) => !visible)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
              <button
                className="button button-primary auth-submit"
                type="submit"
                disabled={loading || password.length < 12 || !confirmPassword}
              >
                {loading ? "Updating password..." : "Save new password"}
              </button>
            </form>
          )}
          <p className="auth-switch">
            <Link to="/forgot-password">Request another reset link</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
