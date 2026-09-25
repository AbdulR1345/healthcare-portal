import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "patient",
    specialization: "",
    location: "",
    fee: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await register({
        ...form,
        fee: form.fee ? Number(form.fee) : undefined,
      });
      const routes = {
        patient: "/dashboard",
        doctor: "/doctor",
        admin: "/admin",
      };
      navigate(routes[user.role] || "/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: "480px" }}>
      <div className="card">
        <h2 style={{ marginBottom: "0.5rem", textAlign: "center" }}>
          Create Account
        </h2>
        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            marginBottom: "1.5rem",
          }}
        >
          Join the healthcare portal
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              required
              maxLength={255}
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
              maxLength={254}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={12}
              maxLength={72}
            />
          </div>
          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              maxLength={20}
            />
          </div>
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              value={form.role}
              onChange={handleChange}
            >
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>

          {form.role === "doctor" && (
            <>
              <div className="form-group">
                <label htmlFor="specialization">Specialization</label>
                <input
                  id="specialization"
                  name="specialization"
                  value={form.specialization}
                  onChange={handleChange}
                  required
                  maxLength={100}
                />
              </div>
              <div className="form-group">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  required
                  maxLength={255}
                />
              </div>
              <div className="form-group">
                <label htmlFor="fee">Consultation Fee ($)</label>
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
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            fontSize: "0.875rem",
          }}
        >
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
