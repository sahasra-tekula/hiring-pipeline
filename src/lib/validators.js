const { AppError } = require("./errors");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value, fieldName) {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new AppError(400, "INVALID_UUID", `${fieldName} must be a valid UUID.`);
  }

  return value;
}

function assertString(value, fieldName, options = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    throw new AppError(400, "INVALID_STRING", `${fieldName} is required.`);
  }

  if (options.maxLength && trimmed.length > options.maxLength) {
    throw new AppError(
      400,
      "STRING_TOO_LONG",
      `${fieldName} must be at most ${options.maxLength} characters.`,
    );
  }

  return trimmed;
}

function assertOptionalString(value, fieldName, options = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return assertString(value, fieldName, options);
}

function assertInteger(value, fieldName, options = {}) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new AppError(400, "INVALID_INTEGER", `${fieldName} must be an integer.`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new AppError(
      400,
      "INTEGER_TOO_SMALL",
      `${fieldName} must be at least ${options.min}.`,
    );
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new AppError(
      400,
      "INTEGER_TOO_LARGE",
      `${fieldName} must be at most ${options.max}.`,
    );
  }

  return parsed;
}

function normalizeEmail(value) {
  const email = assertString(value, "email", { maxLength: 320 }).toLowerCase();

  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new AppError(400, "INVALID_EMAIL", "email must be a valid email address.");
  }

  return email;
}

function parseLimit(value, fallback = 100, max = 1000) {
  if (value === undefined) {
    return fallback;
  }

  return assertInteger(value, "limit", { min: 1, max });
}

module.exports = {
  assertInteger,
  assertOptionalString,
  assertString,
  assertUuid,
  normalizeEmail,
  parseLimit,
};