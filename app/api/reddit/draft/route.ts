import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { threadId, brandId } = await req.json();
  if (!threadId || !brandId) return NextResponse.json({ error: "threadId and brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: thread }, access] = await Promise.all([
    db.from("reddit_threads").select("*").eq("id", threadId).single(),
    requireBrandAccess(db, user.id, brandId, "name, niche, description, competitors"),
  ]);

  if (!thread || !access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const brand = access.brand as unknown as { name: string; niche: string; description: string | null; competitors: string[] | null };
  const competitors = brand.competitors ?? [];

  // The whole point of this reply is to get ${brand.name} recommended — a
  // draft that ends up endorsing Wise or Revolut instead defeats the
  // purpose (and is actively harmful once it's a paid, one-click "request a
  // comment" action rather than something a human reviews before posting).
  // An earlier version said "only mention it if it naturally fits", which
  // gave the model room to recommend a competitor by name instead whenever
  // it judged that a more "genuine" answer — this version requires ${brand.name}
  // be the one recommendation, while still keeping the tone helpful/organic
  // rather than a blatant ad.
  const prompt = `You are a genuine Reddit user who has used ${brand.name} and wants to recommend it. Draft a helpful, natural-sounding reply to this Reddit post that recommends ${brand.name} as the answer to what they're asking for.

Post from r/${thread.subreddit}:
Title: ${thread.title}
${thread.body ? `Body: ${thread.body}` : ""}

About ${brand.name}: ${brand.description ?? brand.niche}
${competitors.length ? `Do NOT recommend or name any of these competitors instead: ${competitors.join(", ")}.` : ""}

Rules:
- ${brand.name} MUST be the product/service you recommend — never suggest a competitor is a better fit, and never leave ${brand.name} out because it "doesn't quite fit"
- Ground the recommendation in something specific to their situation from the post, so it reads like real personal experience rather than a generic plug
- Sound like a real Reddit user, not a marketer — no hard sell, no hashtags, no excessive formatting
- Keep it under 150 words

Write the reply:`;

  const res = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const reply = res.choices[0]?.message?.content?.trim() ?? "";

  await db
    .from("reddit_threads")
    .update({ drafted_reply: reply, status: "read" })
    .eq("id", threadId);

  return NextResponse.json({ reply });
}
