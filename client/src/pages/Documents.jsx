import { useEffect, useState } from "react";
import { api } from "../services/api";
import DocumentUpload from "../components/DocumentUpload";

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(null);
  const [processingErrors, setProcessingErrors] = useState({});
  const [listError, setListError] = useState("");

  const fetchDocuments = () => {
    api.documents
      .list()
      .then((result) => {
        setDocuments(result);
        setListError("");
      })
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const hasProcessingDocuments = documents.some(
    (doc) => doc.ai_processing_status === "processing",
  );

  useEffect(() => {
    if (!hasProcessingDocuments) return undefined;
    const timer = window.setInterval(fetchDocuments, 2000);
    return () => window.clearInterval(timer);
  }, [hasProcessingDocuments]);

  const handleSummarize = async (id) => {
    setSummarizing(id);
    setProcessingErrors((current) => ({ ...current, [id]: "" }));
    try {
      const result = await api.documents.summarize(id);
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...result } : d)),
      );
      if (result.ai_processing_status === "processing") fetchDocuments();
    } catch (err) {
      setProcessingErrors((current) => ({ ...current, [id]: err.message }));
      fetchDocuments();
    } finally {
      setSummarizing(null);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const blob = await api.documents.download(doc.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = doc.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="loading">Loading documents...</div>;

  return (
    <div className="container">
      <h1 style={{ marginBottom: "0.5rem" }}>Medical Documents</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>
        Upload, manage, and get AI-powered summaries of your medical records
      </p>

      <div style={{ marginBottom: "2rem" }}>
        <DocumentUpload onUploaded={fetchDocuments} />
      </div>

      <h2 style={{ marginBottom: "1rem" }}>Your Documents</h2>

      {listError && (
        <div className="empty-state" role="alert">
          Unable to load documents: {listError}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="empty-state">No documents uploaded yet.</div>
      ) : (
        documents.map((doc) => (
          <div key={doc.id} className="card" style={{ marginBottom: "1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h4>{doc.file_name}</h4>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Uploaded {new Date(doc.uploaded_at).toLocaleDateString()} ·{" "}
                  {doc.file_type} · {doc.ai_processing_status || "pending"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleDownload(doc)}
                >
                  Download
                </button>
                {doc.ai_processing_status !== "completed" && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSummarize(doc.id)}
                    disabled={
                      summarizing === doc.id ||
                      doc.ai_processing_status === "processing"
                    }
                  >
                    {summarizing === doc.id ||
                    doc.ai_processing_status === "processing"
                      ? "Processing..."
                      : doc.ai_processing_status === "failed"
                        ? "Retry"
                        : "Summarize"}
                  </button>
                )}
              </div>
            </div>

            {doc.ai_processing_status === "failed" && (
              <p
                role="status"
                style={{ color: "var(--danger)", marginTop: "0.75rem" }}
              >
                Processing failed. Retry when the document is ready.
              </p>
            )}
            {processingErrors[doc.id] && (
              <p
                role="alert"
                style={{ color: "var(--danger)", marginTop: "0.75rem" }}
              >
                {processingErrors[doc.id]}
              </p>
            )}

            {doc.ai_summary && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  background: "var(--bg)",
                  borderRadius: "var(--radius)",
                }}
              >
                <h5 style={{ marginBottom: "0.5rem" }}>AI Summary</h5>
                <p>
                  <strong>Type:</strong>{" "}
                  {doc.ai_summary.documentType || doc.ai_summary.document_type}
                </p>
                {(doc.ai_summary.keyInfo || doc.ai_summary.key_info)?.length >
                  0 && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <strong>Key Information:</strong>
                    <ul style={{ marginLeft: "1.25rem", marginTop: "0.25rem" }}>
                      {(doc.ai_summary.keyInfo || doc.ai_summary.key_info).map(
                        (item, i) => (
                          <li key={i}>{item}</li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                {(
                  doc.ai_summary.abnormalValues ||
                  doc.ai_summary.abnormal_values
                )?.length > 0 && (
                  <div style={{ marginTop: "0.5rem", color: "var(--danger)" }}>
                    <strong>Abnormal Values:</strong>
                    <ul style={{ marginLeft: "1.25rem" }}>
                      {(
                        doc.ai_summary.abnormalValues ||
                        doc.ai_summary.abnormal_values
                      ).map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(doc.ai_summary.followUp || doc.ai_summary.follow_up) && (
                  <p style={{ marginTop: "0.5rem" }}>
                    <strong>Follow-up:</strong>{" "}
                    {doc.ai_summary.followUp || doc.ai_summary.follow_up}
                  </p>
                )}
                <p className="disclaimer">
                  {doc.ai_summary.disclaimer ||
                    "For informational purposes only. Not a substitute for professional medical advice."}
                </p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
