import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function BookAppointment() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.doctors.getById(doctorId)
      .then(setDoctor)
      .catch(() => setError('Doctor not found'))
      .finally(() => setLoading(false));
  }, [doctorId]);

  useEffect(() => {
    if (!date) return;
    api.doctors.getSlots(doctorId, date)
      .then((data) => setSlots(data.slots || []))
      .catch(console.error);
  }, [doctorId, date]);

  const handleBook = async () => {
    if (!selectedSlot || !date) return;
    setBooking(true);
    setError('');

    try {
      await api.appointments.book({
        doctorId,
        appointmentDate: date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        notes,
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  };

  const minDate = new Date().toISOString().split('T')[0];

  if (loading) return <div className="loading">Loading...</div>;
  if (!doctor) return <div className="empty-state">{error || 'Doctor not found'}</div>;

  return (
    <div className="container" style={{ maxWidth: '640px' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Book Appointment</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        with {doctor.full_name} — {doctor.specialization}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <p>📍 {doctor.location} · 💰 ${doctor.fee}</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label htmlFor="date">Select Date</label>
          <input
            id="date"
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedSlot(null);
            }}
          />
        </div>

        {date && (
          <div className="form-group">
            <label>Available Slots</label>
            {slots.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No slots available on this date.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {slots.map((slot) => (
                  <button
                    key={slot.startTime}
                    type="button"
                    className={`btn ${selectedSlot?.startTime === slot.startTime ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot.startTime.slice(0, 5)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <button
          className="btn btn-primary"
          disabled={!selectedSlot || booking}
          onClick={handleBook}
          style={{ width: '100%' }}
        >
          {booking ? 'Booking...' : 'Confirm Booking'}
        </button>
      </div>
    </div>
  );
}
