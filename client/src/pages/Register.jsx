import { useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, HeartPulse, LockKeyhole } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
    role: "patient",
    specialization: "",
    location: "",
    fee: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const passwordScore = useMemo(
    () =>
      [
        form.password.length >= 12,
        /[a-z]/.test(form.password) && /[A-Z]/.test(form.password),
        /\d/.test(form.password),
        /[^a-zA-Z0-9]/.test(form.password),
      ].filter(Boolean).length,
    [form.password],
  );

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      setLoading(false);
      return;
    }

    try {
      await register({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        specialization: form.specialization.trim() || undefined,
        location: form.location.trim() || undefined,
        fee: form.fee ? Number(form.fee) : undefined,
      });
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(err.message);
      setFieldErrors(
        Object.fromEntries(
          (err.errors || []).map(({ path, msg }) => [path, msg]),
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-layout auth-register-layout">
      <aside className="auth-aside">
        <Link to="/" className="auth-brand">
          <span className="brand-mark">
            <HeartPulse size={18} />
          </span>{" "}
          carepath<span className="brand-period">.</span>
        </Link>
        <div className="auth-aside-copy">
          <p className="eyebrow">A connected care workspace</p>
          <h1>Make room for better follow-through.</h1>
          <p>
            Keep appointments, records, and care-team conversations together in
            a private account.
          </p>
          <div className="auth-privacy">
            <LockKeyhole size={16} /> Sign in immediately; email verification
            is optional
          </div>
        </div>
        <p className="auth-aside-foot">Carepath is not for emergency use.</p>
      </aside>
      <section className="auth-content">
        <div className="auth-form-wrap auth-form-wide">
          <Link to="/" className="back-link">
            <ArrowLeft size={15} /> Home
          </Link>
          <p className="eyebrow">Create your account</p>
          <h2>Get started</h2>
          <p className="auth-intro">
            A few details to set up your care workspace.
          </p>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                value={form.fullName}
                onChange={handleChange}
                required
                maxLength={255}
                aria-invalid={Boolean(fieldErrors.fullName)}
              />
              {fieldErrors.fullName && (
                <span className="field-error">{fieldErrors.fullName}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                required
                maxLength={254}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && (
                <span className="field-error">{fieldErrors.email}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="phone">
                Phone <span className="optional-label">Optional</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={handleChange}
                maxLength={20}
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">I am joining as</label>
              <select
                id="role"
                name="role"
                value={form.role}
                onChange={handleChange}
              >
                <option value="patient">Patient</option>
                <option value="doctor">Clinician</option>
              </select>
            </div>
            {form.role === "doctor" && (
              <div className="register-role-fields">
                <div className="form-group">
                  <label htmlFor="specialization">Specialty</label>
                  <input
                    id="specialization"
                    name="specialization"
                    value={form.specialization}
                    onChange={handleChange}
                    required
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.specialization)}
                  />
                  {fieldErrors.specialization && (
                    <span className="field-error">
                      {fieldErrors.specialization}
                    </span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="location">Practice location</label>
                  <input
                    id="location"
                    name="location"
                    value={form.location}
                    onChange={handleChange}
                    required
                    maxLength={255}
                    aria-invalid={Boolean(fieldErrors.location)}
                  />
                  {fieldErrors.location && (
                    <span className="field-error">{fieldErrors.location}</span>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="fee">
                    Consultation fee{" "}
                    <span className="optional-label">Optional</span>
                  </label>
                  <input
                    id="fee"
                    name="fee"
                    type="number"
                    min="0"
                    max="100000"
                    step="0.01"
                    value={form.fee}
                    onChange={handleChange}
                  />
                </div>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="password">Create password</label>
              <div className="password-control">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={12}
                  maxLength={72}
                  aria-describedby="password-strength"
                  aria-invalid={Boolean(fieldErrors.password)}
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
              <div
                className="strength-meter"
                id="password-strength"
                aria-live="polite"
              >
                <span className={`strength-bar strength-${passwordScore}`} />
                <span>
                  {form.password.length
                    ? passwordScore >= 3
                      ? "Strong password"
                      : "Use 12+ characters with a mix of character types"
                    : "At least 12 characters"}
                </span>
              </div>
              {fieldErrors.password && (
                <span className="field-error">{fieldErrors.password}</span>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <div className="password-control">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  required
                  maxLength={72}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
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
              {fieldErrors.confirmPassword && (
                <span className="field-error">
                  {fieldErrors.confirmPassword}
                </span>
              )}
            </div>
            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={
                loading ||
                !form.fullName.trim() ||
                !form.email.trim() ||
                form.password.length < 12 ||
                !form.confirmPassword ||
                (form.role === "doctor" &&
                  (!form.specialization.trim() || !form.location.trim()))
              }
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
          <p className="auth-switch">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
