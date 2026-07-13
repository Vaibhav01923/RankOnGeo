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
    requireBrandAccess(db, user.id, brandId, "name, niche, description"),
  ]);

  if (!thread || !access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const brand = access.brand as unknown as { name: string; niche: string; description: string | null };

  const prompt = `You are a helpful Reddit user who works at ${brand.name}. Draft a genuine, helpful reply to this Reddit post that naturally mentions ${brand.name} only where it truly fits.

Post from r/${thread.subreddit}:
Title: ${thread.title}
${thread.body ? `Body: ${thread.body}` : ""}

About ${brand.name}: ${brand.description ?? brand.niche}

Rules:
- Be genuinely helpful first, promotional second
- Sound like a real Reddit user, not a marketer
- Only mention ${brand.name} if it naturally solves their problem
- Keep it under 150 words
- No hashtags, no excessive formatting

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
