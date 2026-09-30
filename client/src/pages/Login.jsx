import { useState } from "react";
import { Eye, EyeOff, HeartPulse, LockKeyhole } from "lucide-react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const getDestination = (user) => {
    const roleRoutes = {
      patient: "/dashboard",
      doctor: "/doctor",
      admin: "/admin",
    };
    const requested = location.state?.returnTo;
    const returnTo =
      typeof requested === "string"
        ? requested
        : requested?.pathname
          ? `${requested.pathname}${requested.search || ""}${requested.hash || ""}`
          : searchParams.get("returnTo");
    return returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : roleRoutes[user.role] || "/dashboard";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});
    setResendMessage("");

    try {
      const user = await login(email.trim(), password);
      navigate(getDestination(user), { replace: true });
    } catch (err) {
      setError(err.message);
      if (err.code !== "EMAIL_NOT_VERIFIED") {
        setFieldErrors(
          Object.fromEntries(
            (err.errors || []).map(({ path, msg }) => [path, msg]),
          ),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMessage("");
    try {
      const result = await api.auth.resendVerification(email.trim());
      setResendMessage(result.message);
    } catch (err) {
      setResendMessage(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Link to="/" className="auth-brand">
          <span className="brand-mark">
            <HeartPulse size={18} />
          </span>{" "}
          carepath<span className="brand-period">.</span>
        </Link>
        <div className="auth-aside-copy">
          <p className="eyebrow">Your care, in one place</p>
          <h1>Welcome back to a clearer path.</h1>
          <p>
            Sign in to continue managing appointments, records, and
            conversations with your care team.
          </p>
          <div className="auth-privacy">
            <LockKeyhole size={16} /> Protected access to your health workspace
          </div>
        </div>
        <p className="auth-aside-foot">Carepath is not for emergency use.</p>
      </aside>
      <section className="auth-content">
        <div className="auth-form-wrap">
          <p className="eyebrow">Patient and clinician portal</p>
          <h2>Sign in</h2>
          <p className="auth-intro">
            Use the email address linked to your account.
          </p>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {error && (fieldErrors.email || fieldErrors.password) && (
            <div className="field-errors" role="alert">
              {fieldErrors.email || fieldErrors.password}
            </div>
          )}
          {error && error.toLowerCase().includes("verification") && (
            <div className="verification-resend">
              <button
                className="text-button"
                type="button"
                onClick={handleResend}
                disabled={resending || !email.trim()}
              >
                {resending ? "Sending..." : "Resend verification email"}
              </button>
              {resendMessage && <p role="status">{resendMessage}</p>}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && (
                <span className="field-error" id="email-error">
                  {fieldErrors.email}
                </span>
              )}
            </div>
            <div className="form-group">
              <div className="field-label-row">
                <label htmlFor="password">Password</label>
                <Link to="/forgot-password">Forgot password?</Link>
              </div>
              <div className="password-control">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  maxLength={72}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? "password-error" : undefined
                  }
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="field-error" id="password-error">
                  {fieldErrors.password}
                </span>
              )}
            </div>
            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? "Signing in..." : "Continue securely"}
            </button>
          </form>
          <p className="auth-switch">
            New to Carepath? <Link to="/register">Create an account</Link>
          </p>
          <p className="auth-legal">
            <LockKeyhole size={13} /> Your session is protected. Never share
            your password.
          </p>
        </div>
      </section>
    </main>
  );
}
