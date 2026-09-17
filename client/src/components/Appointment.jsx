export default function AppointmentCard({ appointment, onStatusChange, showPatient }) {
  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ marginBottom: '0.25rem' }}>
            {showPatient ? appointment.patient_name : appointment.doctor_name}
          </h4>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {appointment.specialization}
          </p>
        </div>
        <span className={`badge badge-${appointment.status}`}>{appointment.status}</span>
      </div>

      <div style={{ margin: '1rem 0', fontSize: '0.9375rem' }}>
        <p>📅 {formatDate(appointment.appointment_date)}</p>
        <p>🕐 {appointment.start_time?.slice(0, 5)} – {appointment.end_time?.slice(0, 5)}</p>
        {appointment.location && <p>📍 {appointment.location}</p>}
      </div>

      {onStatusChange && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {appointment.status === 'scheduled' && (
            <button className="btn btn-primary btn-sm" onClick={() => onStatusChange(appointment.id, 'confirmed')}>
              Confirm
            </button>
          )}
          {['scheduled', 'confirmed'].includes(appointment.status) && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => onStatusChange(appointment.id, 'completed')}>
                Complete
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => onStatusChange(appointment.id, 'cancelled')}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
