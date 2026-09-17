import { useEffect, useState } from 'react';
import { api } from '../services/api';
import DoctorCard from '../components/DoctorCard';

export default function DoctorSearch() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [filters, setFilters] = useState({
    specialization: '',
    location: '',
    maxFee: '',
    minExperience: '',
    language: '',
    search: '',
    dayOfWeek: '',
  });

  const fetchDoctors = () => {
    setLoading(true);
    setAiResponse(null);
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '')
    );
    api.doctors.search(params)
      .then(setDoctors)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchDoctors();
  };

  const handleAiAssist = async (e) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;

    setAiLoading(true);
    setAiResponse(null);
    try {
      const result = await api.doctors.assist(aiQuery.trim());
      setAiResponse(result);
      if (result.suggestions?.length) {
        setDoctors(result.suggestions);
      }
    } catch (err) {
      setAiResponse({ response: err.message, suggestions: [], disclaimer: '' });
    } finally {
      setAiLoading(false);
    }
  };

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="container">
      <h1 style={{ marginBottom: '0.5rem' }}>Find a Doctor</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Search and filter by specialization, location, fee, availability, and more
      </p>

      <form onSubmit={handleAiAssist} className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%)' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>🤖 AI Appointment Assistant</h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Try: "Cardiologists available this Saturday" or "Dermatologist in Los Angeles under $150"
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="Describe what you're looking for..."
            style={{ flex: 1, minWidth: '200px', padding: '0.625rem 0.875rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
          />
          <button type="submit" className="btn btn-primary" disabled={aiLoading}>
            {aiLoading ? 'Searching...' : 'Ask AI'}
          </button>
        </div>
        {aiResponse && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ fontWeight: 500 }}>{aiResponse.response}</p>
            {aiResponse.disclaimer && <p className="disclaimer">{aiResponse.disclaimer}</p>}
          </div>
        )}
      </form>

      <form onSubmit={handleSearch} className="card" style={{ marginBottom: '2rem' }}>
        <div className="grid grid-3">
          <div className="form-group">
            <label htmlFor="search">Search</label>
            <input id="search" name="search" value={filters.search} onChange={handleChange} placeholder="Name or specialty" />
          </div>
          <div className="form-group">
            <label htmlFor="specialization">Specialization</label>
            <input id="specialization" name="specialization" value={filters.specialization} onChange={handleChange} placeholder="e.g. Cardiology" />
          </div>
          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input id="location" name="location" value={filters.location} onChange={handleChange} placeholder="e.g. New York" />
          </div>
          <div className="form-group">
            <label htmlFor="maxFee">Max Fee ($)</label>
            <input id="maxFee" name="maxFee" type="number" value={filters.maxFee} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="minExperience">Min Experience (years)</label>
            <input id="minExperience" name="minExperience" type="number" value={filters.minExperience} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="language">Language</label>
            <input id="language" name="language" value={filters.language} onChange={handleChange} placeholder="e.g. English" />
          </div>
          <div className="form-group">
            <label htmlFor="dayOfWeek">Available Day</label>
            <select id="dayOfWeek" name="dayOfWeek" value={filters.dayOfWeek} onChange={handleChange}>
              <option value="">Any day</option>
              {days.map((day, i) => (
                <option key={day} value={i}>{day}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">Search Doctors</button>
      </form>

      {loading ? (
        <div className="loading">Searching...</div>
      ) : doctors.length === 0 ? (
        <div className="empty-state">No doctors found matching your criteria.</div>
      ) : (
        <div className="grid grid-2">
          {doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} />
          ))}
        </div>
      )}
    </div>
  );
}
