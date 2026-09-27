import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const getClient = async () => {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

// Customer-facing counterpart to app/api/admin/blog/generate-image/route.ts —
// same model/flow, auth'd via brand ownership instead of requireAdmin, stored
// in the separate "article-images" bucket. Was wired to Gemini
// (gemini-3.1-flash-lite-image), whose API key was never actually configured
// in this project — every call 403'd. Now uses the same OpenAI pipeline as
// automatic cover generation (see lib/article-images.ts).
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { brandId, title, prompt: providedPrompt } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const concept = (providedPrompt ?? "").trim() || title.trim();
  const client = await getClient();
  let buffer: Buffer;
  try {
    const res = await client.images.generate({
      model: "gpt-image-1.5",
      prompt: `A minimal illustration representing: ${concept.slice(0, 300)}. Minimal flat vector illustration, clean simple geometric shapes, generous negative space, no text, no words, no letters, no logos, no watermarks, no photorealism, no 3D render. Warm cream background (#f6f2e9), rust-orange (#b1552e) and olive-green (#7c8a52) as the only accent colors, ink-brown (#302821) for outlines and linework. Editorial tech-blog illustration style.`,
      size: "1536x1024",
      quality: "low",
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");
    buffer = Buffer.from(b64, "base64");
  } catch (e) {
    console.error("[article-image] generation failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Image generation failed" }, { status: 502 });
  }

  const baseName = title.toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
  const path = `${baseName}-${Date.now()}.png`;

  const admin = serverClient();
  const { error: uploadError } = await admin.storage.from("article-images").upload(path, buffer, { contentType: "image/png", upsert: false });
  if (uploadError) {
    console.error("[article-image] upload failed", { path, error: uploadError.message });
    return NextResponse.json({ error: `Failed to store image: ${uploadError.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("article-images").getPublicUrl(path);
  return NextResponse.json({ prompt: concept, imageUrl: pub.publicUrl });
}
