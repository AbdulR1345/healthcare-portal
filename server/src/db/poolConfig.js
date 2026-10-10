const RENDER_POSTGRES_HOST_SUFFIX = ".render.com";

export function getDatabasePoolConfig(connectionString) {
  const config = {
    connectionString,
    connectionTimeoutMillis: 10_000,
  };

  if (typeof connectionString !== "string") {
    return config;
  }

  let hostname;
  try {
    hostname = new URL(connectionString).hostname.toLowerCase();
  } catch {
    return config;
  }

  if (
    hostname.endsWith(RENDER_POSTGRES_HOST_SUFFIX) ||
    hostname === "render.com"
  ) {
    const renderUrl = new URL(connectionString);
    const sslParameters = new Set([
      "ssl",
      "sslcert",
      "sslkey",
      "sslmode",
      "sslrootcert",
    ]);
    for (const parameter of renderUrl.searchParams.keys()) {
      if (sslParameters.has(parameter.toLowerCase())) {
        renderUrl.searchParams.delete(parameter);
      }
    }
    config.connectionString = renderUrl.toString();
    config.ssl = { rejectUnauthorized: true };
  }

  return config;
}
