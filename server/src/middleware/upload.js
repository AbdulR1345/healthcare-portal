import multer from "multer";
import path from "node:path";

const ALLOWED_TYPES = [".pdf", ".jpg", ".jpeg", ".png"];
const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};
const MAX_SIZE = 10 * 1024 * 1024;

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (
    !ALLOWED_TYPES.includes(ext) ||
    MIME_BY_EXTENSION[ext] !== file.mimetype
  ) {
    const error = new Error("Only PDF, JPG, JPEG, and PNG files are allowed");
    error.status = 415;
    return cb(error);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});

export default upload;
