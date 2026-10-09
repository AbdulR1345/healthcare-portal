import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "../..");

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function startResendSink() {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "integration-test-email-id" }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function startAiStub() {
  let requestCount = 0;
  let lastAuthorization = null;
  let behavior = {};
  const requestWaiters = [];
  const server = http.createServer((request, response) => {
    requestCount += 1;
    lastAuthorization = request.headers["x-ai-service-token"] || null;
    for (const waiter of requestWaiters.splice(0)) {
      if (requestCount >= waiter.count) waiter.resolve();
      else requestWaiters.push(waiter);
    }
    request.resume();
    request.on("end", () => {
      const currentBehavior = behavior;
      const sendResponse = () => {
        response.writeHead(currentBehavior.status || 200, {
          "Content-Type": "application/json",
        });
        response.end(
          currentBehavior.rawBody ??
            JSON.stringify(
              currentBehavior.payload || {
                documentType: "Test report",
                keyInfo: [],
                abnormalValues: [],
                followUp: "",
                disclaimer: "Test response",
              },
            ),
        );
      };
      if (currentBehavior.delay)
        setTimeout(sendResponse, currentBehavior.delay);
      else sendResponse();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    get requestCount() {
      return requestCount;
    },
    get lastAuthorization() {
      return lastAuthorization;
    },
    setBehavior(next = {}) {
      behavior = next;
    },
    waitForRequestCount(count) {
      if (requestCount >= count) return Promise.resolve();
      return new Promise((resolve) => requestWaiters.push({ count, resolve }));
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function startObjectStore() {
  const objects = new Map();
  let getCount = 0;
  const server = http.createServer((request, response) => {
    const objectKey = new URL(request.url, "http://localhost").pathname;
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method === "PUT") {
        objects.set(objectKey, Buffer.concat(chunks));
        response.writeHead(200, { ETag: '"test-etag"' });
        response.end();
        return;
      }

      if (request.method === "GET") {
        getCount += 1;
        const object = objects.get(objectKey);
        if (!object) {
          response.writeHead(404, { "Content-Type": "application/xml" });
          response.end("<Error><Code>NoSuchKey</Code></Error>");
          return;
        }
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": object.length,
          "x-amz-request-id": "integration-test",
        });
        response.end(object);
        return;
      }

      response.writeHead(405);
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    get getCount() {
      return getCount;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function waitForApi(child, baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error("API process exited before becoming ready.");
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error("API process did not become ready in time.");
}

export async function startHarness({
  nodeEnv = "test",
  rateLimitOverrides = {},
  databaseUrlOverride,
} = {}) {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error(
      "API harness requires DATABASE_URL to equal TEST_DATABASE_URL.",
    );
  }

  const [port, uploadDir] = await Promise.all([
    availablePort(),
    fs.mkdtemp(path.join(os.tmpdir(), "healthcare-portal-api-test-")),
  ]);
  const resend = await startResendSink();
  const ai = await startAiStub();
  const objectStore = await startObjectStore();
  const testToken = "integration-test-only-ai-token";
  const rateLimitNamespace = crypto.randomUUID();
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: serverDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      PORT: String(port),
      RATE_LIMIT_NAMESPACE: rateLimitNamespace,
      API_RATE_LIMIT_MAX: "10000",
      LOGIN_RATE_LIMIT_MAX: "10000",
      REGISTRATION_RATE_LIMIT_MAX: "10000",
      PASSWORD_RESET_RATE_LIMIT_MAX: "10000",
      EMAIL_VERIFICATION_RATE_LIMIT_MAX: "10000",
      CLINIC_TIME_ZONE: "America/Los_Angeles",
      DATABASE_URL: databaseUrlOverride || process.env.TEST_DATABASE_URL,
      JWT_SECRET:
        nodeEnv === "production"
          ? "G7!qN4#vR9@xK2$mP8^dL5&cW1*zT6bH3uF0yA"
          : "integration-test-only-jwt-secret-with-enough-entropy-7821",
      AI_SERVICE_TOKEN: testToken,
      AI_SERVICE_URL: ai.url,
      AI_PROCESSING_TIMEOUT_MS: "250",
      OPENAI_API_KEY: "",
      MEDICAL_UPLOADS_DIR: uploadDir,
      MEDICAL_STORAGE_PROVIDER: nodeEnv === "production" ? "s3" : "local",
      S3_BUCKET: "healthcare-private-test-bucket",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "integration-test-access-key",
      S3_SECRET_ACCESS_KEY: "integration-test-secret-key",
      S3_ENDPOINT: objectStore.endpoint,
      S3_FORCE_PATH_STYLE: "true",
      CLIENT_URL: "http://localhost:5173",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "integration-test-resend-key",
      EMAIL_FROM: "Healthcare Portal <noreply@example.test>",
      RESEND_BASE_URL: resend.url,
      ...rateLimitOverrides,
    },
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString("utf8");
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForApi(child, baseUrl);
  } catch (error) {
    await resend.close();
    await ai.close();
    await objectStore.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
    throw new Error(`${error.message} ${logs}`);
  }

  return {
    baseUrl,
    rateLimitNamespace,
    ai,
    objectStore,
    aiToken: testToken,
    uploadDir,
    get logs() {
      return logs;
    },
    get exitCode() {
      return child.exitCode;
    },
    async close() {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 3000);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      await Promise.all([resend.close(), ai.close(), objectStore.close()]);
      await fs.rm(uploadDir, { recursive: true, force: true });
    },
  };
}

export async function request(baseUrl, route, options = {}) {
  const headers = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.cookie) headers.Cookie = options.cookie;
  let body = options.body;
  if (
    body !== undefined &&
    !(body instanceof FormData) &&
    typeof body !== "string"
  ) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  } else if (typeof body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || "GET",
    headers,
    body,
  });
  let data = null;
  if (
    (response.headers.get("content-type") || "").includes("application/json")
  ) {
    data = await response.json();
  }
  return { response, data };
}

export function refreshCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie || !setCookie.startsWith("refreshToken=")) {
    throw new Error("Expected a refresh-token cookie.");
  }
  return setCookie.split(";", 1)[0];
}
