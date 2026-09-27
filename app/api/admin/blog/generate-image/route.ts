import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serverClient } from "@/lib/supabase";

const getClient = async () => {
  const OpenAI = (await import("openai")).default;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

// Regenerates one cover image on demand from the studio's "Generate thumbnail"
// button. Was wired to Gemini (gemini-3.1-flash-lite-image), whose API key was
// never actually configured in this project — every call 403'd, silently,
// since the button has no visible error state in the studio for a failed
// fetch beyond the generic error banner. Now uses the same OpenAI pipeline as
// automatic cover generation (see lib/article-images.ts), so a manual
// regenerate and the auto-generated cover look consistent.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { title, slug, prompt: providedPrompt } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

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
    console.error("[blog-image] generation failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Image generation failed" }, { status: 502 });
  }

  const baseName = (slug || title).toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "cover";
  const path = `${baseName}-${Date.now()}.png`;

  const db = serverClient();
  const { error: uploadError } = await db.storage.from("blog-images").upload(path, buffer, { contentType: "image/png", upsert: false });
  if (uploadError) {
    console.error("[blog-image] upload failed", { path, error: uploadError.message });
    return NextResponse.json({ error: `Failed to store image: ${uploadError.message}` }, { status: 500 });
  }

  const { data: pub } = db.storage.from("blog-images").getPublicUrl(path);
  return NextResponse.json({ prompt: concept, imageUrl: pub.publicUrl });
}
