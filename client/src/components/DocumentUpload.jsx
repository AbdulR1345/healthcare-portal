import { useState } from "react";
import { FileUp } from "lucide-react";
import { api } from "../services/api";

export default function DocumentUpload({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [appointmentId, setAppointmentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (appointmentId) formData.append("appointmentId", appointmentId);

      await api.documents.upload(formData);
      setSuccess("Document uploaded successfully");
      setFile(null);
      setAppointmentId("");
      e.target.reset();
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="upload-form">
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="form-group">
        <label htmlFor="file">Select a file (PDF, JPG, or PNG)</label>
        <input
          type="file"
          id="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files[0])}
        />
      </div>

      <div className="form-group">
        <label htmlFor="appointmentId">Appointment ID (optional)</label>
        <input
          type="text"
          id="appointmentId"
          value={appointmentId}
          onChange={(e) => setAppointmentId(e.target.value)}
          placeholder="Link to an appointment"
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        <FileUp size={15} />
        {loading ? "Uploading..." : "Upload document"}
      </button>
    </form>
  );
}
