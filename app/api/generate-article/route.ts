import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeArticle } from "@/lib/article-writer";
import { illustrateArticle } from "@/lib/article-images";

// Text generation plus up to 4 image generations (cover + 3 inline, run in
// parallel) comfortably clears the platform's unconfigured default.
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const { data: { user } } = await clientFromRequest(req).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await checkRateLimit("generate-article", user.id, 20, 3600))) {
    return NextResponse.json({ error: "Too many requests — please try again in a bit." }, { status: 429 });
  }

  const { gapPrompt, brandName, niche, topCompetitor, missingEngines } = await req.json();

  if (!gapPrompt || !brandName) {
    return NextResponse.json({ error: "gapPrompt and brandName are required" }, { status: 400 });
  }

  const result = await writeArticle({ topic: gapPrompt, brandName, niche, topCompetitor, missingEngines });
  const illustrated = await illustrateArticle("article-images", `${brandName}-${gapPrompt}`, result);
  return NextResponse.json({ ...result, article: illustrated.article, coverImageUrl: illustrated.coverImageUrl });
}
