import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import AppointmentCard from '../components/Appointment';

export default function PatientDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.appointments.list(), api.admin.reminders()])
      .then(([appts, rems]) => {
        setAppointments(appts);
        setReminders(rems.filter((r) => !r.sent).slice(0, 3));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const upcoming = appointments.filter(
    (a) => ['scheduled', 'confirmed'].includes(a.status) && new Date(a.appointment_date) >= new Date(new Date().toDateString())
  );
  const previous = appointments.filter((a) => a.status === 'completed' || a.status === 'cancelled');

  const handleCancel = async (id) => {
    try {
      await api.appointments.updateStatus(id, 'cancelled');
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'cancelled' } : a))
      );
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="container">
      <h1 style={{ marginBottom: '0.5rem' }}>Welcome, {user.full_name}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Your patient dashboard</p>

      <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{upcoming.length}</div>
          <div style={{ color: 'var(--text-muted)' }}>Upcoming Appointments</div>
        </div>
        <Link to="/doctors" className="card" style={{ textAlign: 'center', color: 'inherit' }}>
          <div style={{ fontSize: '2rem' }}>🔍</div>
          <div style={{ fontWeight: 600 }}>Find Doctors</div>
        </Link>
        <Link to="/documents" className="card" style={{ textAlign: 'center', color: 'inherit' }}>
          <div style={{ fontSize: '2rem' }}>📄</div>
          <div style={{ fontWeight: 600 }}>My Documents</div>
        </Link>
      </div>

      {reminders.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>🔔 Reminders</h2>
          {reminders.map((r) => (
            <div key={r.id} className="alert alert-info">{r.message}</div>
          ))}
        </section>
      )}

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Upcoming Appointments</h2>
        {upcoming.length === 0 ? (
          <div className="empty-state">
            No upcoming appointments. <Link to="/doctors">Find a doctor</Link>
          </div>
        ) : (
          upcoming.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              onStatusChange={(id, status) => status === 'cancelled' && handleCancel(id)}
            />
          ))
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: '1rem' }}>Appointment History</h2>
        {previous.length === 0 ? (
          <div className="empty-state">No past appointments yet.</div>
        ) : (
          previous.map((a) => <AppointmentCard key={a.id} appointment={a} />)
        )}
      </section>
    </div>
  );
}
