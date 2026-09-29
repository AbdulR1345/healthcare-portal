import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../db/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(
  process.env.MEDICAL_UPLOADS_DIR ||
    path.join(__dirname, "../../private-uploads"),
);
const legacyUploadsDir = path.resolve(__dirname, "../../uploads");
const documentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storedFilenamePattern = /^\d+-\d+\.(pdf|jpg|jpeg|png)$/i;
const MAX_PROCESSING_BYTES = 10 * 1024 * 1024;
const configuredAiTimeout =
  Number(process.env.AI_PROCESSING_TIMEOUT_MS) || 15000;
const AI_TIMEOUT_MS = Math.max(100, Math.min(configuredAiTimeout, 60000));
const MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function getStoredFilename(doc) {
  if (typeof doc.file_url !== "string") return null;

  const filename = path.basename(doc.file_url);
  return storedFilenamePattern.test(filename) ? filename : null;
}

function findStoredFile(doc) {
  const filename = getStoredFilename(doc);
  if (!filename) return null;

  for (const directory of [uploadsDir, legacyUploadsDir]) {
    const filePath = path.resolve(directory, filename);
    if (
      filePath.startsWith(`${directory}${path.sep}`) &&
      fs.existsSync(filePath)
    ) {
      return filePath;
    }
  }

  return null;
}

function withDownloadUrl(doc) {
  return { ...doc, file_url: `/api/documents/${doc.id}/download` };
}

function isSupportedSummary(summary) {
  return (
    summary &&
    typeof summary === "object" &&
    !Array.isArray(summary) &&
    typeof summary.documentType === "string" &&
    summary.documentType.length > 0 &&
    Array.isArray(summary.keyInfo) &&
    summary.keyInfo.every((item) => typeof item === "string") &&
    Array.isArray(summary.abnormalValues) &&
    summary.abnormalValues.every((item) => typeof item === "string") &&
    typeof summary.followUp === "string" &&
    typeof summary.disclaimer === "string"
  );
}

function hasSupportedFileSignature(buffer, extension) {
  if (extension === "pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (extension === "png") {
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return extension === "jpg" || extension === "jpeg"
    ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : false;
}

async function getDocumentForUser(id, user) {
  if (!documentIdPattern.test(id)) return { status: 404 };

  const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [
    id,
  ]);
  if (!rows.length) return { status: 404 };

  const doc = rows[0];
  if (user.role === "admin") return { doc };
  if (user.role === "patient") {
    return doc.patient_id === user.id ? { doc } : { status: 403 };
  }

  if (user.role === "doctor") {
    const { rows: careRows } = await pool.query(
      `SELECT 1
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE a.patient_id = $1
         AND d.user_id = $2
         AND a.status IN ('scheduled', 'confirmed', 'completed')
       LIMIT 1`,
      [doc.patient_id, user.id],
    );

    return careRows.length ? { doc } : { status: 403 };
  }

  return { status: 403 };
}

export async function uploadDocument(req, res) {
  if (req.user.role !== "patient") {
    if (req.file) fs.unlinkSync(req.file.path);
    return res
      .status(403)
      .json({ error: "Only patients can upload documents" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { appointmentId } = req.body;
  const patientId = req.user.id;
  const fileUrl = `/uploads/${req.file.filename}`;

  try {
    const { rows } = await pool.query(
      `INSERT INTO documents (patient_id, appointment_id, file_name, file_url, file_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        patientId,
        appointmentId || null,
        req.file.originalname,
        fileUrl,
        req.file.mimetype,
      ],
    );

    res.status(201).json(withDownloadUrl(rows[0]));
  } catch (err) {
    fs.unlinkSync(req.file.path);
    console.error("Upload document error:", err);
    res.status(500).json({ error: "Failed to upload document" });
  }
}

export async function getMyDocuments(req, res) {
  try {
    let query;
    let params;

    if (req.user.role === "patient") {
      query =
        "SELECT * FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC";
      params = [req.user.id];
    } else if (req.user.role === "doctor") {
      query = `
        SELECT doc.* FROM documents doc
        WHERE EXISTS (
          SELECT 1
          FROM appointments a
          JOIN doctors d ON d.id = a.doctor_id
          WHERE a.patient_id = doc.patient_id
            AND d.user_id = $1
            AND a.status IN ('scheduled', 'confirmed', 'completed')
        )
        ORDER BY doc.uploaded_at DESC
      `;
      params = [req.user.id];
    } else {
      query = "SELECT * FROM documents ORDER BY uploaded_at DESC";
      params = [];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows.map(withDownloadUrl));
  } catch (err) {
    console.error("Get documents error:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
}

export async function downloadDocument(req, res) {
  try {
    const result = await getDocumentForUser(req.params.id, req.user);
    if (!result.doc) {
      return res.status(result.status).json({
        error: result.status === 404 ? "Document not found" : "Access denied",
      });
    }

    const filePath = findStoredFile(result.doc);
    if (!filePath)
      return res.status(404).json({ error: "Document file not found" });

    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    return res.download(
      filePath,
      path.basename(result.doc.file_name),
      (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: "Document file not found" });
        }
        if (err)
          console.error("Download document error:", err.code || "unknown");
      },
    );
  } catch (err) {
    console.error("Download document error:", err.code || "unknown");
    return res.status(500).json({ error: "Failed to download document" });
  }
}

export async function summarizeDocument(req, res) {
  try {
    const result = await getDocumentForUser(req.params.id, req.user);
    if (!result.doc) {
      return res.status(result.status).json({
        error: result.status === 404 ? "Document not found" : "Access denied",
      });
    }

    const doc = result.doc;
    if (doc.ai_processing_status === "completed") {
      return res.json({ ...withDownloadUrl(doc), ai_summary: doc.ai_summary });
    }
    if (doc.ai_processing_status === "processing") {
      return res.status(202).json({
        id: doc.id,
        ai_processing_status: "processing",
      });
    }

    const filePath = findStoredFile(doc);
    if (!filePath) {
      return res.status(404).json({ error: "Document file not found" });
    }

    const extension = path.extname(filePath).slice(1).toLowerCase();
    const expectedMime = MIME_BY_EXTENSION[extension];
    if (!expectedMime || doc.file_type !== expectedMime) {
      return res.status(415).json({ error: "Unsupported document file type" });
    }

    let fileBuffer;
    try {
      const fileStat = await fs.promises.stat(filePath);
      if (!fileStat.isFile() || fileStat.size === 0) {
        return res
          .status(422)
          .json({ error: "Document file is empty or invalid" });
      }
      if (fileStat.size > MAX_PROCESSING_BYTES) {
        return res
          .status(413)
          .json({ error: "Document exceeds processing limits" });
      }
      fileBuffer = await fs.promises.readFile(filePath);
    } catch {
      return res.status(404).json({ error: "Document file not found" });
    }

    if (!hasSupportedFileSignature(fileBuffer, extension)) {
      return res.status(422).json({ error: "Document file is unreadable" });
    }

    const { rows: claimedRows } = await pool.query(
      `UPDATE documents
       SET ai_processing_status = 'processing',
           ai_processing_started_at = NOW(),
           ai_processing_finished_at = NULL,
           ai_processing_error = NULL
       WHERE id = $1 AND ai_processing_status IN ('pending', 'failed')
       RETURNING id`,
      [doc.id],
    );
    if (!claimedRows.length) {
      const { rows: currentRows } = await pool.query(
        "SELECT * FROM documents WHERE id = $1",
        [doc.id],
      );
      const current = currentRows[0];
      if (current?.ai_processing_status === "completed") {
        return res.json({
          ...withDownloadUrl(current),
          ai_summary: current.ai_summary,
        });
      }
      if (current?.ai_processing_status === "processing") {
        return res.status(202).json({
          id: doc.id,
          ai_processing_status: "processing",
        });
      }
      return res.status(409).json({ error: "Document cannot be processed" });
    }

    try {
      const serviceToken = process.env.AI_SERVICE_TOKEN;
      if (!serviceToken) throw new Error("AI_SERVICE_UNAVAILABLE");

      const aiUrl = `${process.env.AI_SERVICE_URL || "http://localhost:8000"}/summarize`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      let summary;
      try {
        const response = await fetch(aiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AI-Service-Token": serviceToken,
          },
          body: JSON.stringify({
            file_type: expectedMime,
            content_base64: fileBuffer.toString("base64"),
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("AI_SERVICE_UNAVAILABLE");

        try {
          summary = await response.json();
        } catch (err) {
          if (err.name === "AbortError") throw err;
          throw new Error("INVALID_AI_RESPONSE");
        }
      } finally {
        clearTimeout(timeout);
      }
      if (!isSupportedSummary(summary)) throw new Error("INVALID_AI_RESPONSE");

      const { rows: completedRows } = await pool.query(
        `UPDATE documents
         SET ai_summary = $1,
             ai_processing_status = 'completed',
             ai_processing_finished_at = NOW(),
             ai_processing_error = NULL
         WHERE id = $2 AND ai_processing_status = 'processing'
         RETURNING *`,
        [JSON.stringify(summary), doc.id],
      );
      if (!completedRows.length) throw new Error("PROCESSING_STATE_CHANGED");

      return res.json({
        ...withDownloadUrl(completedRows[0]),
        ai_summary: summary,
      });
    } catch (err) {
      const errorCode =
        err.name === "AbortError"
          ? "AI_SERVICE_TIMEOUT"
          : ["INVALID_AI_RESPONSE", "AI_SERVICE_UNAVAILABLE"].includes(
                err.message,
              )
            ? err.message
            : "PROCESSING_FAILED";
      await pool.query(
        `UPDATE documents
         SET ai_processing_status = 'failed',
             ai_processing_finished_at = NOW(),
             ai_processing_error = $1
         WHERE id = $2 AND ai_processing_status = 'processing'`,
        [errorCode, doc.id],
      );
      console.error("Document processing failed:", errorCode);
      return res.status(errorCode === "INVALID_AI_RESPONSE" ? 502 : 503).json({
        error:
          errorCode === "AI_SERVICE_TIMEOUT"
            ? "Document processing timed out"
            : "Document processing failed",
        ai_processing_status: "failed",
      });
    }
  } catch (err) {
    console.error("Document processing error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to summarize document" });
  }
}

export default {
  uploadDocument,
  getMyDocuments,
  downloadDocument,
  summarizeDocument,
};
