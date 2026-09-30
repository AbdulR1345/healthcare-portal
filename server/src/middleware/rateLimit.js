import rateLimit from "express-rate-limit";
import PostgresRateLimitStore from "./rateLimitStore.js";

function configuredLimit(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return limit;
}

export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: configuredLimit("API_RATE_LIMIT_MAX", 600),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  store: new PostgresRateLimitStore("api"),
  handler: (_req, res) =>
    res
      .status(429)
      .json({ error: "Too many requests. Please try again later." }),
});

export function createEndpointLimiter(name, fallbackLimit, windowMs) {
  return rateLimit({
    windowMs,
    limit: configuredLimit(name, fallbackLimit),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store: new PostgresRateLimitStore(name),
    handler: (_req, res) =>
      res
        .status(429)
        .json({ error: "Too many requests. Please try again later." }),
  });
}

export const loginLimiter = createEndpointLimiter(
  "LOGIN_RATE_LIMIT_MAX",
  10,
  15 * 60 * 1000,
);
export const registrationLimiter = createEndpointLimiter(
  "REGISTRATION_RATE_LIMIT_MAX",
  5,
  60 * 60 * 1000,
);
export const passwordResetLimiter = createEndpointLimiter(
  "PASSWORD_RESET_RATE_LIMIT_MAX",
  5,
  15 * 60 * 1000,
);
export const emailVerificationLimiter = createEndpointLimiter(
  "EMAIL_VERIFICATION_RATE_LIMIT_MAX",
  5,
  60 * 60 * 1000,
);
