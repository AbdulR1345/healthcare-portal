import { Link } from 'react-router-dom';

export default function DoctorCard({ doctor }) {
  return (
    <div className="doctor-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ marginBottom: '0.25rem' }}>{doctor.full_name}</h3>
          <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.5rem' }}>
            {doctor.specialization}
          </p>
        </div>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          ⭐ {doctor.rating || '4.5'}
        </span>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        📍 {doctor.location}
      </p>

      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
        <span>💰 ${doctor.fee}</span>
        <span>🎓 {doctor.experience_years} yrs</span>
        {doctor.languages?.length > 0 && (
          <span>🗣 {doctor.languages.join(', ')}</span>
        )}
      </div>

      {doctor.bio && (
        <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
          {doctor.bio.slice(0, 120)}{doctor.bio.length > 120 ? '...' : ''}
        </p>
      )}

      <Link to={`/book/${doctor.id}`} className="btn btn-primary" style={{ width: '100%' }}>
        Book Appointment
      </Link>
    </div>
  );
}
