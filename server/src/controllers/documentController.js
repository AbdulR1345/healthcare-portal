const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

async function uploadDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { appointmentId } = req.body;
  const patientId = req.user.id;
  const fileUrl = `/uploads/${req.file.filename}`;

  try {
    const { rows } = await pool.query(
      `INSERT INTO documents (patient_id, appointment_id, file_name, file_url, file_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [patientId, appointmentId || null, req.file.originalname, fileUrl, req.file.mimetype]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    fs.unlinkSync(req.file.path);
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function getMyDocuments(req, res) {
  try {
    let query;
    let params;

    if (req.user.role === 'patient') {
      query = 'SELECT * FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC';
      params = [req.user.id];
    } else if (req.user.role === 'doctor') {
      query = `
        SELECT doc.* FROM documents doc
        JOIN appointments a ON a.patient_id = doc.patient_id
        JOIN doctors d ON d.id = a.doctor_id
        WHERE d.user_id = $1
        ORDER BY doc.uploaded_at DESC
      `;
      params = [req.user.id];
    } else {
      query = 'SELECT * FROM documents ORDER BY uploaded_at DESC';
      params = [];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
}

async function summarizeDocument(req, res) {
  const { id } = req.params;

  try {
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Document not found' });

    const doc = rows[0];

    if (req.user.role === 'patient' && doc.patient_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(__dirname, '../../', doc.file_url.replace(/^\//, ''));
    let textContent = `Medical document: ${doc.file_name}`;

    if (fs.existsSync(filePath) && doc.file_type.startsWith('text')) {
      textContent = fs.readFileSync(filePath, 'utf-8').slice(0, 5000);
    }

    const aiUrl = `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/summarize`;
    let summary;

    try {
      const response = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textContent, file_name: doc.file_name }),
      });
      summary = await response.json();
    } catch {
      summary = {
        documentType: 'Medical Report',
        keyInfo: ['Document uploaded successfully', 'Awaiting AI service connection'],
        abnormalValues: [],
        followUp: 'Consult your healthcare provider for interpretation.',
        disclaimer: 'For informational purposes only. Not a substitute for professional medical advice.',
      };
    }

    await pool.query('UPDATE documents SET ai_summary = $1 WHERE id = $2', [JSON.stringify(summary), id]);

    res.json({ ...doc, ai_summary: summary });
  } catch (err) {
    console.error('Summarize document error:', err);
    res.status(500).json({ error: 'Failed to summarize document' });
  }
}

module.exports = { uploadDocument, getMyDocuments, summarizeDocument };
