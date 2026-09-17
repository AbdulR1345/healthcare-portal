import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DoctorSearch from './pages/DoctorSearch';
import BookAppointment from './pages/BookAppointment';
import Documents from './pages/Documents';
import Chat from './pages/Chat';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}

function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;

  const routes = {
    patient: '/dashboard',
    doctor: '/doctor',
    admin: '/admin',
  };
  return <Navigate to={routes[user.role] || '/dashboard'} replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main style={{ minHeight: 'calc(100vh - 64px)', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        <Routes>
          <Route path="/" element={<DashboardRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={['patient']}>
                <PatientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute roles={['doctor']}>
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctors"
            element={
              <ProtectedRoute roles={['patient']}>
                <DoctorSearch />
              </ProtectedRoute>
            }
          />
          <Route
            path="/book/:doctorId"
            element={
              <ProtectedRoute roles={['patient']}>
                <BookAppointment />
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
        </Routes>
      </main>
    </>
  );
}
