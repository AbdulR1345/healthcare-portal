import { Component } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Profile from "./pages/Profile";
import Appointments from "./pages/Appointments";
import DoctorProfile from "./pages/DoctorProfile";
import Patients from "./pages/Patients";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import DoctorAvailability from "./pages/DoctorAvailability";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PatientDashboard from "./pages/PatientDashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import DoctorSearch from "./pages/DoctorSearch";
import BookAppointment from "./pages/BookAppointment";
import Documents from "./pages/Documents";
import Chat from "./pages/Chat";

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return (
      <div className="page-loader" role="status">
        Loading your workspace
      </div>
    );
  if (!user)
    return <Navigate to="/login" state={{ returnTo: location }} replace />;
  if (roles && !roles.includes(user.role)) return <DashboardRedirect />;

  return children;
}

class GlobalErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary">
          <p className="eyebrow">Something went wrong</p>
          <h1>We couldn't load this page.</h1>
          <p>
            Your account and saved records are unchanged. Try reloading the
            page.
          </p>
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404 · Page not found</p>
      <h1>This page isn't here.</h1>
      <p>Check the address or return to the home page.</p>
      <a className="button button-primary" href="/">
        Go to home
      </a>
    </main>
  );
}

function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const routes = {
    patient: "/dashboard",
    doctor: "/doctor",
    admin: "/admin",
  };
  return <Navigate to={routes[user.role] || "/dashboard"} replace />;
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <div className="app-frame">
        <Navbar />
        <div className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <PatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctors"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <DoctorSearch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctors/:doctorId"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <DoctorProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/book/:doctorId"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <BookAppointment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointments"
              element={
                <ProtectedRoute roles={["patient", "doctor", "admin"]}>
                  <Appointments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/appointments/:appointmentId"
              element={
                <ProtectedRoute roles={["patient", "doctor", "admin"]}>
                  <Appointments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <Patients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients/:patientId"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <Patients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/availability"
              element={
                <ProtectedRoute roles={["doctor"]}>
                  <DoctorAvailability />
                </ProtectedRoute>
              }
            />
            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </GlobalErrorBoundary>
  );
}
