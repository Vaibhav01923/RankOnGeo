import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

async function searchReddit(keyword: string): Promise<Array<Record<string, unknown>>> {
  // Reddit requires OAuth since mid-2023 for reliable API access.
  // Try OAuth if credentials are available, fall back to public JSON.
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  const headers: Record<string, string> = {
    "User-Agent": "web:rankongeo:v1.0 (by /u/rankongeo_app)",
  };

  if (clientId && clientSecret) {
    // Get OAuth token via client_credentials grant
    const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": headers["User-Agent"],
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (tokenRes.ok) {
      const { access_token } = await tokenRes.json();
      headers["Authorization"] = `bearer ${access_token}`;
    }
  }

  const baseUrl = headers["Authorization"]
    ? "https://oauth.reddit.com"
    : "https://www.reddit.com";

  const url = `${baseUrl}/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=25&t=month&type=link`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

  if (!res.ok) {
    throw new Error(`Reddit returned ${res.status} for keyword "${keyword}"`);
  }

  const data = await res.json();
  return (data.data?.children ?? []).map((c: { data: Record<string, unknown> }) => c.data);
}

export async function POST(req: NextRequest) {
  const { brandId } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id, name");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // Keywords are shared across the workspace — sync with the whole brand set,
  // not just the acting user's.
  const { data: keywords } = await db
    .from("social_keywords")
    .select("keyword")
    .eq("brand_id", brandId);

  if (!keywords?.length) return NextResponse.json({ synced: 0, message: "No keywords added yet" });

  const allRows: object[] = [];
  const errors: string[] = [];

  for (const { keyword } of keywords) {
    try {
      const posts = await searchReddit(keyword);
      for (const post of posts) {
        allRows.push({
          brand_id: brandId,
          keyword,
          reddit_id: post.id as string,
          subreddit: post.subreddit as string,
          title: post.title as string,
          url: `https://reddit.com${post.permalink as string}`,
          body: ((post.selftext as string) ?? "").slice(0, 2000),
          score: (post.score as number) ?? 0,
          num_comments: (post.num_comments as number) ?? 0,
          reddit_created_at: post.created_utc
            ? new Date((post.created_utc as number) * 1000).toISOString()
            : null,
        });
      }
    } catch (e) {
      errors.push((e as Error).message);
    }
    // Small delay between keywords to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  if (allRows.length) {
    await db
      .from("reddit_threads")
      .upsert(allRows, { onConflict: "brand_id,reddit_id", ignoreDuplicates: true });
  }

  return NextResponse.json({
    synced: allRows.length,
    ...(errors.length ? { errors } : {}),
  });
}
