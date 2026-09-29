import { Router } from "express";
import {
  uploadDocument,
  getMyDocuments,
  downloadDocument,
  summarizeDocument,
} from "../controllers/documentController.js";
import { authenticate } from "../middleware/auth.js";
import upload from "../middleware/upload.js";

const router = Router();

router.use(authenticate);

router.get("/", getMyDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.get("/:id/download", downloadDocument);
router.post("/:id/summarize", summarizeDocument);

export default router;
