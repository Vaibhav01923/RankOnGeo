import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { brandId } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();

  const { data: brand } = await db
    .from("brands")
    .select("id, name")
    .eq("id", brandId)
    .eq("user_id", user?.id)
    .single();

  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: keywords } = await db
    .from("social_keywords")
    .select("keyword")
    .eq("brand_id", brandId)
    .eq("user_id", user?.id);

  if (!keywords?.length) return NextResponse.json({ synced: 0, message: "No keywords to monitor" });

  const allRows: object[] = [];

  for (const { keyword } of keywords) {
    try {
      const res = await fetch(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=25&t=month`,
        { headers: { "User-Agent": "RankOnGeo/1.0" }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const posts = (data.data?.children ?? []) as Array<{ data: Record<string, unknown> }>;

      for (const { data: post } of posts) {
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
    } catch {
      // Skip failed keyword — continue with others
    }
  }

  if (allRows.length) {
    await db
      .from("reddit_threads")
      .upsert(allRows, { onConflict: "brand_id,reddit_id", ignoreDuplicates: true });
  }

  return NextResponse.json({ synced: allRows.length });
}
