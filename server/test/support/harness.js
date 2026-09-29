import { spawn } from "node:child_process";
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

async function startSmtpSink() {
  const server = net.createServer((socket) => {
    let pending = "";
    let receivingData = false;
    let authLoginStep = 0;
    socket.write("220 local test mail sink\r\n");

    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      let end;
      while ((end = pending.indexOf("\r\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (receivingData) {
          if (line === ".") {
            receivingData = false;
            socket.write("250 message accepted\r\n");
          }
          continue;
        }

        const command = line.split(/\s/, 1)[0].toUpperCase();
        if (command === "EHLO" || command === "HELO") {
          socket.write(
            "250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1000000\r\n",
          );
        } else if (
          command === "AUTH" &&
          line.toUpperCase().startsWith("AUTH LOGIN")
        ) {
          authLoginStep = 1;
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (command === "AUTH") {
          socket.write("235 authentication accepted\r\n");
        } else if (authLoginStep === 1) {
          authLoginStep = 2;
          socket.write("334 UGFzc3dvcmQ6\r\n");
        } else if (authLoginStep === 2) {
          authLoginStep = 0;
          socket.write("235 authentication accepted\r\n");
        } else if (
          command === "MAIL" ||
          command === "RCPT" ||
          command === "RSET"
        ) {
          socket.write("250 accepted\r\n");
        } else if (command === "DATA") {
          receivingData = true;
          socket.write("354 end with dot\r\n");
        } else if (command === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("250 accepted\r\n");
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function startAiStub() {
  let requestCount = 0;
  let lastAuthorization = null;
  const server = http.createServer((request, response) => {
    requestCount += 1;
    lastAuthorization = request.headers["x-ai-service-token"] || null;
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          documentType: "Test report",
          keyInfo: [],
          abnormalValues: [],
          followUp: "",
          disclaimer: "Test response",
        }),
      );
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

export async function startHarness() {
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
  const smtp = await startSmtpSink();
  const ai = await startAiStub();
  const testToken = "integration-test-only-ai-token";
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: serverDir,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      JWT_SECRET: "integration-test-only-jwt-secret-with-enough-entropy-7821",
      AI_SERVICE_TOKEN: testToken,
      AI_SERVICE_URL: ai.url,
      OPENAI_API_KEY: "",
      MEDICAL_UPLOADS_DIR: uploadDir,
      CLIENT_URL: "http://localhost:5173",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtp.port),
      SMTP_USER: "integration-test-user",
      SMTP_PASS: "integration-test-password",
      SMTP_SECURE: "false",
    },
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForApi(child, baseUrl);
  } catch (error) {
    await smtp.close();
    await ai.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
    throw error;
  }

  return {
    baseUrl,
    ai,
    aiToken: testToken,
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
      await Promise.all([smtp.close(), ai.close()]);
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
