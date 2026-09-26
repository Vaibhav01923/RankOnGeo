// Shared by /api/reddit/sync (dashboard's manual keyword sync) and
// /api/setup/reddit-opportunities (onboarding wizard's live Reddit preview) —
// both need the same "search Reddit's public JSON API, optionally via OAuth"
// logic, just with different call sites and result handling.

const REDDIT_USER_AGENT = "web:rankongeo:v1.0 (by /u/rankongeo_app)";

export type RedditAuthHeaders = Record<string, string>;

// Reddit requires OAuth since mid-2023 for reliable API access. Falls back to
// the public, unauthenticated JSON endpoints when no app credentials are
// configured — lower rate limits, but fine for occasional/low-volume calls.
// Fetch once per request and reuse across calls — a fresh client_credentials
// token per keyword/subreddit is wasted latency for no benefit.
export async function getRedditHeaders(): Promise<RedditAuthHeaders> {
  const headers: RedditAuthHeaders = { "User-Agent": REDDIT_USER_AGENT };
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return headers;

  try {
    const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REDDIT_USER_AGENT,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (tokenRes.ok) {
      const { access_token } = await tokenRes.json();
      if (access_token) headers["Authorization"] = `bearer ${access_token}`;
    }
  } catch {}
  return headers;
}

function baseUrlFor(headers: RedditAuthHeaders): string {
  return headers["Authorization"] ? "https://oauth.reddit.com" : "https://www.reddit.com";
}

export async function searchReddit(
  keyword: string,
  headers: RedditAuthHeaders,
  opts?: { sort?: "new" | "relevance" | "top" | "hot"; limit?: number; time?: "hour" | "day" | "week" | "month" | "year" | "all" }
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    q: keyword,
    sort: opts?.sort ?? "new",
    limit: String(opts?.limit ?? 25),
    t: opts?.time ?? "month",
    type: "link",
  });
  const res = await fetch(`${baseUrlFor(headers)}/search.json?${params}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Reddit returned ${res.status} for keyword "${keyword}"`);
  const data = await res.json();
  return (data.data?.children ?? []).map((c: { data: Record<string, unknown> }) => c.data);
}

export type SubredditInfo = { subscribers: number | null };

// Best-effort — a subreddit lookup failing (private/banned/quarantined sub,
// rate limit) should never take down the caller, just come back empty.
export async function getSubredditInfo(subreddit: string, headers: RedditAuthHeaders): Promise<SubredditInfo> {
  try {
    const res = await fetch(`${baseUrlFor(headers)}/r/${encodeURIComponent(subreddit)}/about.json`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { subscribers: null };
    const data = await res.json();
    const subscribers = data?.data?.subscribers;
    return { subscribers: typeof subscribers === "number" ? subscribers : null };
  } catch {
    return { subscribers: null };
  }
}
