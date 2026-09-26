import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { checkRateLimit } from "@/lib/rate-limit";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Drafts the reply the "AI suggest" button puts in the Engage panel: a short, genuine
// comment for a post that showed up in an AI answer. The brand's details are read here
// from the database rather than taken from the request, and the caller must be signed in
// with access to the brand.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, platform, promptText } = await req.json().catch(() => ({}));
  if (typeof brandId !== "string" || typeof promptText !== "string" || !promptText.trim()) {
    return NextResponse.json({ error: "brandId and promptText are required" }, { status: 400 });
  }
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id, name, domain, niche");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  if (!(await checkRateLimit("engage-draft", user.id, 40, 60 * 60))) {
    return NextResponse.json({ error: "Too many drafts just now. Try again in a little while." }, { status: 429 });
  }

  const brand = access.brand as unknown as { name: string; domain: string; niche: string | null };
  const where = typeof platform === "string" && /^[\w .-]{1,30}$/.test(platform.trim()) ? platform.trim() : "forum";

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 250,
    messages: [
      { role: "system", content: "You write short, genuine forum comments for people. Reply with only the comment text: no preamble, no quotation marks." },
      {
        role: "user",
        content: `Write a short, helpful ${where} comment (2-3 sentences) that naturally and authentically mentions ${brand.name} (${brand.domain}${brand.niche ? `, ${brand.niche}` : ""}) in the context of this post. The post appeared when someone searched: "${promptText.trim().slice(0, 300)}". Keep it genuine and conversational, not promotional.`,
      },
    ],
  });

  return NextResponse.json({ reply: response.choices[0]?.message?.content?.trim() ?? "" });
}
