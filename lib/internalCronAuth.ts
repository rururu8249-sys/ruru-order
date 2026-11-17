/** Server-only internal cron authentication; never allow a hardcoded fallback. */
import { timingSafeEqual } from "node:crypto";

function configuredKeys(): string[] {
  return [process.env.CRON_SECRET, process.env.BANKDA_CRON_SECRET]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function equalSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only server environment secrets authorize internal calls. User-Agent is never authentication. */
export function authorizedInternalCronRequest(request: { headers: Headers }): boolean {
  const auth = request.headers.get("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() || "";
  const custom = (request.headers.get("x-ruru-internal-cron") || "").trim();
  const provided = custom || bearer;
  const secrets = configuredKeys();
  if (!provided || secrets.length === 0) return false;
  return secrets.some((secret) => equalSecret(provided, secret));
}

/** Fail closed when Vercel secrets are not configured. */
export function internalCronSecret(): string {
  const key = String(process.env.BANKDA_CRON_SECRET || process.env.CRON_SECRET || "").trim();
  if (!key) throw new Error("INTERNAL_CRON_SECRET_NOT_CONFIGURED");
  return key;
}
