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
    const filePath = findStoredFile(doc);
    let textContent = `Medical document: ${doc.file_name}`;

    if (filePath && doc.file_type?.startsWith("text")) {
      textContent = fs.readFileSync(filePath, "utf-8").slice(0, 5000);
    }

    const aiUrl = `${process.env.AI_SERVICE_URL || "http://localhost:8000"}/summarize`;
    let summary;

    try {
      const response = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.AI_SERVICE_TOKEN
            ? { "X-AI-Service-Token": process.env.AI_SERVICE_TOKEN }
            : {}),
        },
        body: JSON.stringify({ text: textContent, file_name: doc.file_name }),
      });
      if (!response.ok) throw new Error("AI service request failed");
      summary = await response.json();
    } catch {
      summary = {
        documentType: "Medical Report",
        keyInfo: [
          "Document uploaded successfully",
          "Awaiting AI service connection",
        ],
        abnormalValues: [],
        followUp: "Consult your healthcare provider for interpretation.",
        disclaimer:
          "For informational purposes only. Not a substitute for professional medical advice.",
      };
    }

    await pool.query("UPDATE documents SET ai_summary = $1 WHERE id = $2", [
      JSON.stringify(summary),
      doc.id,
    ]);

    res.json({ ...withDownloadUrl(doc), ai_summary: summary });
  } catch (err) {
    console.error("Summarize document error:", err.code || "unknown");
    res.status(500).json({ error: "Failed to summarize document" });
  }
}

export default {
  uploadDocument,
  getMyDocuments,
  downloadDocument,
  summarizeDocument,
};
