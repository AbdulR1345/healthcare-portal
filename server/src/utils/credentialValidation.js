import { body, validationResult } from "express-validator";

export const MAX_PASSWORD_BYTES = 72;

const weakPasswords = new Set([
  "password",
  "password123",
  "123456",
  "123456789012",
  "qwerty",
]);

function isWeakPassword(password, email) {
  const normalizedPassword = password.toLowerCase();
  const localPart =
    typeof email === "string" && email.includes("@")
      ? email.split("@")[0].toLowerCase()
      : "";
  const compactPassword = normalizedPassword.replace(/[^\p{L}\p{N}]/gu, "");
  const compactLocalPart = localPart.replace(/[^\p{L}\p{N}]/gu, "");

  return (
    weakPasswords.has(normalizedPassword) ||
    [...password].every((character) => character === password[0]) ||
    normalizedPassword === localPart ||
    (compactPassword.length > 0 && compactPassword === compactLocalPart)
  );
}

export function createEmailValidator() {
  return body("email")
    .isString()
    .withMessage("Email must be a string")
    .bail()
    .trim()
    .isEmail()
    .withMessage("Please provide a valid email")
    .bail()
    .isLength({ max: 254 })
    .withMessage("Email must be 254 characters or fewer")
    .normalizeEmail();
}

export function createPasswordValidator() {
  return body("password")
    .isString()
    .withMessage("Password must be a string")
    .bail()
    .isLength({ min: 12 })
    .withMessage("Password must be at least 12 characters")
    .bail()
    .custom((password, { req }) => {
      if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
        throw new Error("Password must be 72 bytes or fewer");
      }

      if (isWeakPassword(password, req.body.email)) {
        throw new Error("Password is too easy to guess");
      }

      return true;
    });
}

export async function validateCredentials(email, password) {
  const req = { body: { email, password } };
  await createEmailValidator().run(req);
  await createPasswordValidator().run(req);

  return {
    email: req.body.email?.trim().toLowerCase(),
    errors: validationResult(req)
      .array()
      .map(({ path, msg }) => ({ path, msg })),
  };
}
