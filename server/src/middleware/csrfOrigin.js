function parseOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigins() {
  const configured =
    process.env.CLIENT_URL ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173");

  return configured
    .split(",")
    .map((origin) => parseOrigin(origin.trim()))
    .filter(Boolean);
}

export function requireTrustedOrigin(req, res, next) {
  const originHeader = req.get("origin");
  const refererHeader = req.get("referer");

  if (
    originHeader === undefined &&
    refererHeader === undefined &&
    process.env.NODE_ENV !== "production"
  ) {
    return next();
  }

  const requestOrigin =
    originHeader !== undefined
      ? parseOrigin(originHeader)
      : parseOrigin(refererHeader);

  if (requestOrigin && configuredOrigins().includes(requestOrigin)) {
    return next();
  }

  return res.status(403).json({ error: "Untrusted request origin" });
}
