import { useEffect, useState } from 'react';
import { api } from '../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.stats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading admin dashboard...</div>;
  if (!stats) return <div className="empty-state">Failed to load stats.</div>;

  return (
    <div className="container">
      <h1 style={{ marginBottom: '0.5rem' }}>Admin Dashboard</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Platform overview and analytics
      </p>

      <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--primary)' }}>
            {stats.totalPatients}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>Total Patients</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--secondary)' }}>
            {stats.totalDoctors}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>Total Doctors</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--warning)' }}>
            {stats.totalAppointments}
          </div>
          <div style={{ color: 'var(--text-muted)' }}>Total Appointments</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Completion Rate</h3>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--success)' }}>
            {stats.completionRate}%
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            {stats.completedAppointments} of {stats.totalAppointments} appointments completed
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            completionRate = (completedAppointments / totalAppointments) × 100
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Popular Specializations</h3>
          {stats.popularSpecializations.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No data yet</p>
          ) : (
            <ul style={{ listStyle: 'none' }}>
              {stats.popularSpecializations.map((s) => (
                <li
                  key={s.specialization}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span>{s.specialization}</span>
                  <strong>{s.count} doctors</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
