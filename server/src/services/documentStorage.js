import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const storageKeyPattern =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\d+-\d+)\.(pdf|jpg|jpeg|png)$/i;
const mimeByExtension = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

let s3Client;

function getProvider() {
  return (
    process.env.MEDICAL_STORAGE_PROVIDER ||
    (process.env.NODE_ENV === "production" ? "s3" : "local")
  );
}

function getS3Configuration() {
  return {
    bucket: process.env.S3_BUCKET?.trim(),
    region: process.env.S3_REGION?.trim(),
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    prefix: (process.env.S3_PREFIX || "medical-documents").replace(
      /^\/+|\/+$/g,
      "",
    ),
  };
}

export function assertProductionStorageConfiguration() {
  if (process.env.NODE_ENV !== "production") return;

  const config = getS3Configuration();
  if (
    getProvider() !== "s3" ||
    !config.bucket ||
    !config.region ||
    !config.accessKeyId ||
    !config.secretAccessKey ||
    config.prefix
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(
      "Production private object storage configuration is required.",
    );
  }

  if (config.endpoint && !/^https?:\/\//i.test(config.endpoint)) {
    throw new Error("S3_ENDPOINT must use HTTP or HTTPS.");
  }
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(
      endpoint.hostname.toLowerCase(),
    );
    if (endpoint.protocol !== "https:" && !isLoopback) {
      throw new Error("Production S3_ENDPOINT must use HTTPS.");
    }
  }
}

function getS3Client() {
  if (s3Client) return s3Client;

  const config = getS3Configuration();
  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return s3Client;
}

function isValidStorageKey(key) {
  return typeof key === "string" && storageKeyPattern.test(key);
}

export function getDocumentStorageKey(fileUrl) {
  if (typeof fileUrl !== "string") return null;
  const match = /^\/uploads\/([^/\\]+)$/.exec(fileUrl);
  return match && isValidStorageKey(match[1]) ? match[1] : null;
}

function getObjectKey(storageKey) {
  const { prefix } = getS3Configuration();
  return `${prefix}/${storageKey}`;
}

function getLocalDirectories() {
  return [
    path.resolve(
      process.env.MEDICAL_UPLOADS_DIR ||
        path.join(__dirname, "../../private-uploads"),
    ),
    path.resolve(__dirname, "../../uploads"),
  ];
}

function resolveLocalPath(directory, storageKey) {
  const resolvedDirectory = path.resolve(directory);
  const filePath = path.resolve(resolvedDirectory, storageKey);
  return filePath.startsWith(`${resolvedDirectory}${path.sep}`)
    ? filePath
    : null;
}

async function readS3Object(storageKey) {
  const config = getS3Configuration();
  let response;
  try {
    response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: getObjectKey(storageKey),
      }),
    );
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }

  if (response.ContentLength > MAX_DOCUMENT_BYTES) {
    const error = new Error("Stored document exceeds size limits.");
    error.code = "DOCUMENT_TOO_LARGE";
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.Body) {
    size += chunk.length;
    if (size > MAX_DOCUMENT_BYTES) {
      const error = new Error("Stored document exceeds size limits.");
      error.code = "DOCUMENT_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export async function storeDocument(storageKey, buffer, contentType) {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("Invalid document storage key.");
  }
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0 ||
    buffer.length > MAX_DOCUMENT_BYTES
  ) {
    throw new Error("Invalid document content.");
  }

  if (getProvider() === "s3") {
    const config = getS3Configuration();
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: getObjectKey(storageKey),
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
    return;
  }

  if (getProvider() !== "local") {
    throw new Error("Unsupported medical document storage provider.");
  }

  const directory = getLocalDirectories()[0];
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const filePath = resolveLocalPath(directory, storageKey);
  if (!filePath) throw new Error("Invalid document storage key.");
  await fs.writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
}

export async function readDocument(storageKey) {
  if (!isValidStorageKey(storageKey)) return null;

  if (getProvider() === "s3") {
    return readS3Object(storageKey);
  }
  if (getProvider() !== "local") {
    throw new Error("Unsupported medical document storage provider.");
  }

  for (const directory of getLocalDirectories()) {
    const filePath = resolveLocalPath(directory, storageKey);
    if (!filePath) continue;
    try {
      const stats = await fs.lstat(filePath);
      if (!stats.isFile() || stats.isSymbolicLink()) return null;
      if (stats.size > MAX_DOCUMENT_BYTES) {
        const error = new Error("Stored document exceeds size limits.");
        error.code = "DOCUMENT_TOO_LARGE";
        throw error;
      }
      return await fs.readFile(filePath);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

export async function deleteDocument(storageKey) {
  if (!isValidStorageKey(storageKey)) return;

  if (getProvider() === "s3") {
    const config = getS3Configuration();
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: getObjectKey(storageKey),
      }),
    );
    return;
  }
  if (getProvider() !== "local") return;

  const filePath = resolveLocalPath(getLocalDirectories()[0], storageKey);
  if (filePath) await fs.rm(filePath, { force: true });
}

export function getDocumentMimeType(storageKey) {
  const extension = storageKey?.split(".").pop()?.toLowerCase();
  return mimeByExtension[extension] || null;
}

export default {
  assertProductionStorageConfiguration,
  deleteDocument,
  getDocumentMimeType,
  getDocumentStorageKey,
  readDocument,
  storeDocument,
};
