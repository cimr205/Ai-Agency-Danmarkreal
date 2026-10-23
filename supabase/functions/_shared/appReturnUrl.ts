// Where an OAuth callback may send the browser back to. The client proposes a
// return URL when the flow starts; only app origins on this allow-list and
// in-app paths under a known locale are accepted, so a callback can never be
// used as an open redirect.
//
//   APP_ALLOWED_ORIGINS  optional, comma-separated extra origins (e.g. a preview domain)

const DEFAULT_ORIGINS = [
  "https://www.aiagencydanmark.dk",
  "https://aiagencydanmark.dk",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const LOCALES = new Set(["en", "da", "de"]);

export const DEFAULT_APP_ORIGIN = DEFAULT_ORIGINS[0];

function allowedOrigins(): Set<string> {
  const extra = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

/**
 * Returns the URL (origin + path, no query/hash) if it is an allowed app
 * origin and the path starts with `/<locale>/app/`; otherwise null.
 */
export function sanitizeAppReturnUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!allowedOrigins().has(url.origin)) return null;
  const [, locale, area] = url.pathname.split("/");
  if (!LOCALES.has(locale) || area !== "app") return null;
  return `${url.origin}${url.pathname}`;
}
