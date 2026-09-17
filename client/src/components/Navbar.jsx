import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const dashboardLink = {
    patient: '/dashboard',
    doctor: '/doctor',
    admin: '/admin',
  };

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="brand-icon">🩺</span>
          Healthcare Portal
        </Link>

        {user && (
          <div className="navbar-links">
            <Link to={dashboardLink[user.role]}>Dashboard</Link>
            {user.role === 'patient' && <Link to="/doctors">Find Doctors</Link>}
            <Link to="/documents">Documents</Link>
            <Link to="/chat">Messages</Link>
            <span className="navbar-user">{user.full_name}</span>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
