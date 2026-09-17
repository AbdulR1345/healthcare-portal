import { useEffect, useState } from 'react';
import { api } from '../services/api';
import AppointmentCard from '../components/Appointment';

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.appointments.list()
      .then(setAppointments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const todayAppts = appointments.filter(
    (a) => a.appointment_date === today && a.status !== 'cancelled'
  );
  const upcoming = appointments.filter(
    (a) => ['scheduled', 'confirmed'].includes(a.status) && a.appointment_date >= today
  );

  const handleStatusChange = async (id, status) => {
    try {
      const updated = await api.appointments.updateStatus(id, status);
      setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="container">
      <h1 style={{ marginBottom: '0.5rem' }}>Doctor Dashboard</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Manage today's appointments and patient consultations
      </p>

      <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{todayAppts.length}</div>
          <div style={{ color: 'var(--text-muted)' }}>Today's Appointments</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--secondary)' }}>{upcoming.length}</div>
          <div style={{ color: 'var(--text-muted)' }}>Upcoming Total</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)' }}>
            {appointments.filter((a) => a.status === 'completed').length}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>Completed</div>
        </div>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Today's Appointments</h2>
        {todayAppts.length === 0 ? (
          <div className="empty-state">No appointments scheduled for today.</div>
        ) : (
          todayAppts.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              showPatient
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: '1rem' }}>All Upcoming</h2>
        {upcoming.filter((a) => a.appointment_date !== today).length === 0 ? (
          <div className="empty-state">No other upcoming appointments.</div>
        ) : (
          upcoming
            .filter((a) => a.appointment_date !== today)
            .map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                showPatient
                onStatusChange={handleStatusChange}
              />
            ))
        )}
      </section>
    </div>
  );
}
