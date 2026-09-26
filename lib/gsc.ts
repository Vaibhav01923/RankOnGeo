import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Google Search Console (read-only). The connection is per brand: the user
// authorises once, we keep an encrypted refresh token, and mint a short-lived
// access token whenever the Analytics tab asks for data.

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly openid email";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/webmasters/v3";
const DAY_MS = 24 * 60 * 60 * 1000;

export function gscConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

function secret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

// ---- signed OAuth state ----------------------------------------------------
// The callback is a plain GET from Google, so the state must prove which
// brand/user started the flow and that it is recent — otherwise anyone could
// craft a callback URL that attaches their Google account to someone's brand.

export type GscState = { brandId: string; userId: string; exp: number };

export function signState(payload: GscState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string | null | undefined, now = Date.now()): GscState | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GscState;
    if (!parsed.brandId || !parsed.userId || typeof parsed.exp !== "number" || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- token encryption ------------------------------------------------------

function encryptionKey(): Buffer {
  return createHash("sha256").update(`gsc-token-v1:${secret()}`).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(stored: string): string | null {
  try {
    const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- OAuth -----------------------------------------------------------------

export function buildAuthUrl(redirectUri: string, state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // Without prompt=consent Google only returns a refresh token the first
    // time an account authorises the app, so a reconnect would come back with
    // no way to keep the connection alive.
    prompt: "consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; email: string | null } | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: secret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { refresh_token?: string; id_token?: string; scope?: string };
  if (!json.refresh_token) return null;
  // The user can untick the Search Console box on Google's consent screen;
  // the connection is useless without it.
  if (!json.scope?.includes("webmasters.readonly")) return null;
  let email: string | null = null;
  try {
    // id_token came straight from Google over TLS in this same request, so
    // reading its claims without re-verifying the signature is fine here.
    const payload = JSON.parse(Buffer.from((json.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    email = typeof payload.email === "string" ? payload.email : null;
  } catch {}
  return { refreshToken: json.refresh_token, email };
}

export type AccessTokenResult = { ok: true; token: string } | { ok: false; reason: "revoked" | "error" };

export async function getAccessToken(refreshToken: string): Promise<AccessTokenResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: secret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (res.ok) {
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ? { ok: true, token: json.access_token } : { ok: false, reason: "error" };
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, reason: json.error === "invalid_grant" ? "revoked" : "error" };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {}
}

// ---- Search Console API ----------------------------------------------------

export type GscSite = { siteUrl: string; permissionLevel: string };

export async function listSites(accessToken: string): Promise<GscSite[] | null> {
  const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const json = (await res.json()) as { siteEntry?: GscSite[] };
  return (json.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
}

function normalizeHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
}

// Picks the Search Console property that covers a brand's domain. A Domain
// property (sc-domain:) is the broadest and cleanest, then an https URL-prefix
// property, then anything else on the same host. Returns null when the
// account simply doesn't own this site — the UI then asks the user to choose.
export function pickSiteForDomain(sites: GscSite[], domain: string): string | null {
  const host = normalizeHost(domain);
  if (!host) return null;
  const rank = (s: GscSite): number => {
    if (s.siteUrl.startsWith("sc-domain:")) {
      const d = normalizeHost(s.siteUrl);
      return d === host ? 0 : host.endsWith(`.${d}`) ? 1 : -1;
    }
    if (normalizeHost(s.siteUrl) !== host) return -1;
    return s.siteUrl.startsWith("https://") ? 2 : 3;
  };
  const candidates = sites.map((s) => ({ s, r: rank(s) })).filter((c) => c.r >= 0).sort((a, b) => a.r - b.r);
  return candidates[0]?.s.siteUrl ?? null;
}

export type GscRow = { label: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscTotals = { clicks: number; impressions: number; ctr: number; position: number };
export type GscReport = {
  range: { start: string; end: string };
  totals: GscTotals;
  series: { label: string; count: number }[];
  queries: GscRow[];
  pages: GscRow[];
};

type ApiRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function query(accessToken: string, siteUrl: string, body: Record<string, unknown>): Promise<ApiRow[] | null> {
  const res = await fetch(`${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { rows?: ApiRow[] };
  return json.rows ?? [];
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Search Console data trails real time by ~2 days, so the window ends
// yesterday and never goes under a week — a 24-hour window would be empty.
export function reportRange(days: number, now = Date.now()): { start: string; end: string; span: number } {
  const span = Math.max(days, 7);
  const end = now - DAY_MS;
  return { start: isoDay(end - (span - 1) * DAY_MS), end: isoDay(end), span };
}

export function summarizeRows(rows: ApiRow[]): GscTotals {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  // Position is averaged weighted by impressions, the way Search Console does.
  const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

export async function fetchReport(accessToken: string, siteUrl: string, days: number): Promise<GscReport | null> {
  const { start, end, span } = reportRange(days);
  const base = { startDate: start, endDate: end };
  const [byDate, byQuery, byPage] = await Promise.all([
    query(accessToken, siteUrl, { ...base, dimensions: ["date"], rowLimit: 200 }),
    query(accessToken, siteUrl, { ...base, dimensions: ["query"], rowLimit: 10 }),
    query(accessToken, siteUrl, { ...base, dimensions: ["page"], rowLimit: 10 }),
  ]);
  if (!byDate || !byQuery || !byPage) return null;

  const clicksByDay = new Map(byDate.map((r) => [r.keys[0], r.clicks]));
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const series = Array.from({ length: span }, (_, i) => {
    const d = new Date(endMs - (span - 1 - i) * DAY_MS);
    return {
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      count: clicksByDay.get(isoDay(d.getTime())) ?? 0,
    };
  });
  const toRows = (rows: ApiRow[]): GscRow[] =>
    rows.map((r) => ({ label: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));

  return { range: { start, end }, totals: summarizeRows(byDate), series, queries: toRows(byQuery), pages: toRows(byPage) };
}

// ---- per-page and site-wide queries used by the blog autopilot -------------

export type PageStats = { clicks: number; impressions: number; ctr: number; position: number; queries: GscRow[] };

// How a single published post is doing in Google: its own totals plus the
// searches it is actually shown for (which the rewrite pass then targets).
export async function fetchPageStats(accessToken: string, siteUrl: string, pageUrl: string, days = 28): Promise<PageStats | null> {
  const { start, end } = reportRange(days);
  const filter = { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: pageUrl }] }] };
  const [totals, queries] = await Promise.all([
    query(accessToken, siteUrl, { startDate: start, endDate: end, ...filter }),
    query(accessToken, siteUrl, { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 15, ...filter }),
  ]);
  if (!totals || !queries) return null;
  const t = summarizeRows(totals);
  return { ...t, queries: queries.map((r) => ({ label: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) };
}

export async function fetchTopQueries(accessToken: string, siteUrl: string, days = 90, rowLimit = 250): Promise<GscRow[] | null> {
  const { start, end } = reportRange(days);
  const rows = await query(accessToken, siteUrl, { startDate: start, endDate: end, dimensions: ["query"], rowLimit });
  return rows ? rows.map((r) => ({ label: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) : null;
}

// Searches the site already shows up for but doesn't win (position 8-30):
// the cheapest keywords to rank for, since Google already associates the site
// with them and one focused article can lift them onto page one.
export function strikingDistance(rows: GscRow[], limit = 10): string[] {
  return rows
    .filter((r) => r.position >= 8 && r.position <= 30 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
    .map((r) => r.label);
}
