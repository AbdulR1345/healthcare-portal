import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await login(email, password);
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
    <div className="container" style={{ maxWidth: "420px" }}>
      <div className="card">
        <h2 style={{ marginBottom: "0.5rem", textAlign: "center" }}>
          Welcome Back
        </h2>
        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            marginBottom: "1.5rem",
          }}
        >
          Sign in to your healthcare portal
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            fontSize: "0.875rem",
          }}
        >
          Don't have an account? <Link to="/register">Register</Link>
        </p>

        {import.meta.env.DEV && (
          <div
            className="alert alert-info"
            style={{ marginTop: "1.5rem", marginBottom: 0 }}
          >
            <strong>Demo:</strong> patient@demo.com / doctor@demo.com /
            admin@healthcare.com — password: password123
          </div>
        )}
      </div>
    </div>
  );
}
