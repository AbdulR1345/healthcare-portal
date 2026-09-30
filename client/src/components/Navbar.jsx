import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  HeartPulse,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "./Navbar.css";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout().finally(() => navigate("/"));
    setMenuOpen(false);
  };

  const dashboardLink = {
    patient: "/dashboard",
    doctor: "/doctor",
    admin: "/admin",
  };

  const links = user
    ? [
        { to: dashboardLink[user.role], label: "Overview" },
        ...(user.role === "patient"
          ? [{ to: "/doctors", label: "Find care" }]
          : []),
        ...(user.role === "doctor"
          ? [{ to: "/patients", label: "Patients" }]
          : []),
        ...(user.role === "doctor"
          ? [{ to: "/availability", label: "Availability", icon: CalendarDays }]
          : []),
        { to: "/appointments", label: "Appointments" },
        { to: "/documents", label: "Records" },
        ...(user.role !== "admin"
          ? [{ to: "/chat", label: "Messages", icon: MessageCircle }]
          : []),
        { to: "/notifications", label: "Notifications", icon: Bell },
      ]
    : [];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand" aria-label="Carepath home">
          <span className="brand-mark">
            <HeartPulse size={19} strokeWidth={2.2} />
          </span>
          <span>
            carepath<span className="brand-period">.</span>
          </span>
        </Link>

        {user ? (
          <>
            <nav className="primary-nav" aria-label="Main navigation">
              {links.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="nav-link">
                  {Icon && <Icon size={16} aria-hidden="true" />}
                  {label}
                </Link>
              ))}
            </nav>
            <div className="header-actions">
              <Link to="/profile" className="profile-link">
                <span className="avatar avatar-small" aria-hidden="true">
                  {user.full_name?.slice(0, 1)?.toUpperCase()}
                </span>
                <span className="profile-name">{user.full_name}</span>
              </Link>
              <button
                className="icon-button logout-button"
                onClick={handleLogout}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={17} />
              </button>
              <button
                className="icon-button mobile-menu-button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={
                  menuOpen ? "Close navigation menu" : "Open navigation menu"
                }
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <nav className="public-nav" aria-label="Main navigation">
              <a href="/#care">Our approach</a>
              <a href="/#how-it-works">How it works</a>
              <Link
                to="/login?returnTo=%2Fdoctors"
                className="public-find-link"
              >
                <Search size={15} /> Find a doctor
              </Link>
            </nav>
            <div className="header-actions public-actions">
              <Link to="/login" className="login-link">
                Sign in
              </Link>
              <Link to="/register" className="button button-primary header-cta">
                Get started <ArrowRight size={15} />
              </Link>
            </div>
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={
                menuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </>
        )}
      </div>
      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {user ? (
            <>
              {links.map(({ to, label }) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)}>
                  {label}
                </Link>
              ))}
              <Link to="/profile" onClick={() => setMenuOpen(false)}>
                Profile
              </Link>
              <Link to="/settings" onClick={() => setMenuOpen(false)}>
                <Settings2 size={16} /> Settings
              </Link>
              <button className="mobile-signout" onClick={handleLogout}>
                <LogOut size={16} /> Sign out
              </button>
            </>
          ) : (
            <>
              <a href="/#care" onClick={() => setMenuOpen(false)}>
                Our approach
              </a>
              <a href="/#how-it-works" onClick={() => setMenuOpen(false)}>
                How it works
              </a>
              <Link
                to="/login?returnTo=%2Fdoctors"
                onClick={() => setMenuOpen(false)}
              >
                Find a doctor
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}>
                Get started
              </Link>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
