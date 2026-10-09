import { useEffect, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import DoctorCard from "../components/DoctorCard";

export default function DoctorSearch() {
  const [doctors, setDoctors] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [filters, setFilters] = useState({
    specialization: "",
    location: "",
    maxFee: "",
    minExperience: "",
    language: "",
    search: "",
    dayOfWeek: "",
  });

  const fetchDoctors = async (nextFilters = filters) => {
    setLoading(true);
    setLoadError("");
    setAiResponse(null);
    const params = Object.fromEntries(
      Object.entries(nextFilters).filter(([, value]) => value !== ""),
    );
    try {
      const result = await api.doctors.search(params);
      const matchingDoctors = Array.isArray(result) ? result : [];
      setDoctors(matchingDoctors);
      setSpecialties((current) =>
        [
          ...new Set([
            ...current,
            ...matchingDoctors
              .map((doctor) => doctor.specialization)
              .filter(Boolean),
          ]),
        ].sort((a, b) => a.localeCompare(b)),
      );
    } catch (error) {
      setDoctors([]);
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors(filters);
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
    setLoadError("");
    try {
      const result = await api.doctors.assist(aiQuery.trim());
      setAiResponse(result);
      if (result.suggestions?.length) {
        setDoctors(result.suggestions);
      } else {
        setDoctors([]);
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return (
    <main className="container doctor-search-page">
      <header className="page-heading">
        <p className="eyebrow">Clinician directory</p>
        <h1>Find a doctor</h1>
        <p>
          Search by specialty, location, fee, experience, language, or
          availability.
        </p>
      </header>

      <form onSubmit={handleAiAssist} className="assist-search">
        <div className="assist-copy">
          <span className="assist-icon">
            <Sparkles size={17} />
          </span>
          <div>
            <h2>Describe the care you're looking for</h2>
            <p>
              Search assistance helps match your description to clinician
              listings. It does not provide medical advice.
            </p>
          </div>
        </div>
        <div className="assist-controls">
          <label className="sr-only" htmlFor="aiQuery">
            Describe what you're looking for
          </label>
          <input
            id="aiQuery"
            value={aiQuery}
            onChange={(event) => setAiQuery(event.target.value)}
            placeholder="For example, a cardiologist in Boston"
            maxLength={500}
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={aiLoading || !aiQuery.trim()}
          >
            {aiLoading ? (
              "Searching..."
            ) : (
              <>
                <BrainCircuit size={16} /> Find matches
              </>
            )}
          </button>
        </div>
        {aiResponse && (
          <p className="assist-response" role="status">
            {aiResponse.response}
          </p>
        )}
      </form>

      <form onSubmit={handleSearch} className="search-filters">
        <div className="filter-title">
          <h2>
            <SlidersHorizontal size={17} /> Refine your search
          </h2>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              const reset = {
                specialization: "",
                location: "",
                maxFee: "",
                minExperience: "",
                language: "",
                search: "",
                dayOfWeek: "",
              };
              setFilters(reset);
              fetchDoctors(reset);
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="filter-grid">
          <div className="form-group">
            <label htmlFor="search">Name or specialty</label>
            <input
              id="search"
              name="search"
              value={filters.search}
              onChange={handleChange}
              placeholder="Search clinicians"
            />
          </div>
          <div className="form-group">
            <label htmlFor="specialization">Specialty</label>
            <select
              id="specialization"
              name="specialization"
              value={filters.specialization}
              onChange={handleChange}
            >
              <option value="">All specialties</option>
              {specialties.map((specialty) => (
                <option key={specialty} value={specialty}>
                  {specialty}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              name="location"
              value={filters.location}
              onChange={handleChange}
              placeholder="City or region"
            />
          </div>
          <div className="form-group">
            <label htmlFor="maxFee">Maximum fee</label>
            <input
              id="maxFee"
              name="maxFee"
              type="number"
              min="0"
              value={filters.maxFee}
              onChange={handleChange}
              placeholder="Any fee"
            />
          </div>
          <div className="form-group">
            <label htmlFor="minExperience">Minimum experience</label>
            <input
              id="minExperience"
              name="minExperience"
              type="number"
              min="0"
              value={filters.minExperience}
              onChange={handleChange}
              placeholder="Any experience"
            />
          </div>
          <div className="form-group">
            <label htmlFor="language">Language</label>
            <input
              id="language"
              name="language"
              value={filters.language}
              onChange={handleChange}
              placeholder="Language"
            />
          </div>
          <div className="form-group">
            <label htmlFor="dayOfWeek">Available day</label>
            <select
              id="dayOfWeek"
              name="dayOfWeek"
              value={filters.dayOfWeek}
              onChange={handleChange}
            >
              <option value="">Any day</option>
              {days.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="button button-primary">
          <Search size={15} /> Search directory
        </button>
      </form>

      <section className="doctor-results" aria-live="polite">
        <div className="results-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>
              {loading
                ? "Searching clinicians"
                : `${doctors.length} ${doctors.length === 1 ? "clinician" : "clinicians"} found`}
            </h2>
          </div>
          <Link className="text-link" to="/appointments">
            View appointments <ArrowRight size={14} />
          </Link>
        </div>
        {loadError && (
          <div className="alert alert-error" role="alert">
            {loadError}{" "}
            <button
              className="text-button"
              type="button"
              onClick={() => fetchDoctors()}
            >
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <div className="doctor-results-grid" aria-label="Loading clinicians">
            <div className="skeleton doctor-skeleton" />
            <div className="skeleton doctor-skeleton" />
          </div>
        ) : doctors.length === 0 && !loadError ? (
          <div className="empty-state">
            No clinicians match those filters. Try broadening your search.
          </div>
        ) : (
          <div className="doctor-results-grid">
            {doctors.map((doctor) => (
              <DoctorCard key={doctor.id} doctor={doctor} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
