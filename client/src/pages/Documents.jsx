import { useEffect, useState } from "react";
import { ArrowDownToLine, FileText, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import DocumentUpload from "../components/DocumentUpload";

export default function Documents() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(null);
  const [processingErrors, setProcessingErrors] = useState({});
  const [listError, setListError] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [downloadErrors, setDownloadErrors] = useState({});

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
    setDownloading(doc.id);
    setDownloadErrors((current) => ({ ...current, [doc.id]: "" }));
    try {
      const blob = await api.documents.download(doc.id);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = doc.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setDownloadErrors((current) => ({ ...current, [doc.id]: err.message }));
    } finally {
      setDownloading(null);
    }
  };

  if (loading)
    return (
      <main className="container documents-page">
        <div className="skeleton dashboard-heading-skeleton" />
        <div className="skeleton dashboard-panel-skeleton" />
        <div className="skeleton document-skeleton" />
      </main>
    );

  return (
    <main className="container documents-page">
      <header className="page-heading">
        <p className="eyebrow">Health records</p>
        <h1>
          {user.role === "admin" ? "Document overview" : "Medical documents"}
        </h1>
        <p>
          {user.role === "admin"
            ? "Review document processing status across the platform."
            : "Securely manage medical files and review AI-generated summaries."}
        </p>
      </header>
      {user.role === "patient" && (
        <section className="document-upload-section">
          <div>
            <p className="eyebrow">Add to your records</p>
            <h2>Upload a document</h2>
            <p>Supported formats: PDF, JPG, and PNG.</p>
          </div>
          <DocumentUpload onUploaded={fetchDocuments} />
        </section>
      )}
      <section className="document-list-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Private records</p>
            <h2>
              {user.role === "admin" ? "Platform documents" : "Documents"}
            </h2>
          </div>
          <span className="badge">{documents.length} total</span>
        </div>
        {listError && (
          <div className="alert alert-error" role="alert">
            Unable to load documents: {listError}{" "}
            <button className="text-button" onClick={fetchDocuments}>
              Try again
            </button>
          </div>
        )}
        {!listError && documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={24} />
            <p>No documents available.</p>
            {user.role === "patient" && (
              <span>Uploaded records will appear here.</span>
            )}
          </div>
        ) : (
          <div className="document-list">
            {documents.map((doc) => (
              <article key={doc.id} className="document-record">
                <div className="document-record-head">
                  <span className="document-file-icon">
                    <FileText size={19} />
                  </span>
                  <div className="document-record-title">
                    <h3>{doc.file_name}</h3>
                    <p>
                      {new Date(doc.uploaded_at).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}{" "}
                      · {doc.file_type}
                    </p>
                  </div>
                  <span
                    className={`badge badge-${doc.ai_processing_status || "pending"}`}
                  >
                    {doc.ai_processing_status || "pending"}
                  </span>
                </div>
                <div className="document-record-actions">
                  <button
                    className="button button-secondary button-small"
                    onClick={() => handleDownload(doc)}
                    disabled={downloading === doc.id}
                  >
                    <ArrowDownToLine size={14} />
                    {downloading === doc.id
                      ? "Preparing..."
                      : "Download securely"}
                  </button>
                  {doc.ai_processing_status !== "completed" && (
                    <button
                      className="button button-primary button-small"
                      onClick={() => handleSummarize(doc.id)}
                      disabled={
                        summarizing === doc.id ||
                        doc.ai_processing_status === "processing"
                      }
                    >
                      <Sparkles size={14} />
                      {summarizing === doc.id ||
                      doc.ai_processing_status === "processing"
                        ? "Processing..."
                        : doc.ai_processing_status === "failed"
                          ? "Retry summary"
                          : "Generate summary"}
                    </button>
                  )}
                </div>
                {(processingErrors[doc.id] || downloadErrors[doc.id]) && (
                  <div
                    className="alert alert-error document-error"
                    role="alert"
                  >
                    {processingErrors[doc.id] || downloadErrors[doc.id]}
                  </div>
                )}
                {doc.ai_processing_status === "failed" && (
                  <p className="document-status-note">
                    Summary processing failed. You can retry when the document
                    is ready.
                  </p>
                )}
                {doc.ai_summary && (
                  <section className="summary-panel">
                    <div className="summary-heading">
                      <Sparkles size={16} />
                      <div>
                        <h4>AI-generated summary</h4>
                        <span>
                          {doc.ai_summary.documentType ||
                            doc.ai_summary.document_type ||
                            "Document summary"}
                        </span>
                      </div>
                    </div>
                    {(doc.ai_summary.keyInfo || doc.ai_summary.key_info)
                      ?.length > 0 && (
                      <div className="summary-block">
                        <strong>Key information</strong>
                        <ul>
                          {(
                            doc.ai_summary.keyInfo || doc.ai_summary.key_info
                          ).map((item, index) => (
                            <li key={`${doc.id}-key-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(
                      doc.ai_summary.abnormalValues ||
                      doc.ai_summary.abnormal_values
                    )?.length > 0 && (
                      <div className="summary-block summary-alert">
                        <strong>Values flagged in the source document</strong>
                        <ul>
                          {(
                            doc.ai_summary.abnormalValues ||
                            doc.ai_summary.abnormal_values
                          ).map((item, index) => (
                            <li key={`${doc.id}-abnormal-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(doc.ai_summary.followUp || doc.ai_summary.follow_up) && (
                      <div className="summary-block">
                        <strong>Follow-up noted in summary</strong>
                        <p>
                          {doc.ai_summary.followUp || doc.ai_summary.follow_up}
                        </p>
                      </div>
                    )}
                    <p className="disclaimer">
                      {doc.ai_summary.disclaimer ||
                        "For informational purposes only. Not a substitute for professional medical advice."}
                    </p>
                  </section>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {user.role !== "patient" && (
        <p className="disclaimer">
          Access is limited by your role and existing care relationships. Files
          are retrieved through authenticated, private downloads.
        </p>
      )}
    </main>
  );
}
