import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const getGemini = () => new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY });

// Customer-facing counterpart to app/api/admin/blog/generate-image/route.ts —
// same model/flow, auth'd via brand ownership instead of requireAdmin, and
// stored in the separate "article-images" bucket.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { brandId, title, prompt: providedPrompt } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const prompt =
    (providedPrompt ?? "").trim() || `Generate a thumbnail for this blog post: "${title.trim()}"`;

  let imageB64: string | undefined;
  let mimeType = "image/png";
  try {
    const result = await getGemini().models.generateContent({
      model: "gemini-3.1-flash-lite-image",
      contents: prompt,
      config: { responseModalities: ["IMAGE"] },
    });
    const parts = result.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    imageB64 = imagePart?.inlineData?.data;
    mimeType = imagePart?.inlineData?.mimeType ?? mimeType;
  } catch (e) {
    console.error("[article-image] generation failed", { error: e instanceof Error ? e.message : e });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Image generation failed" }, { status: 502 });
  }
  if (!imageB64) return NextResponse.json({ error: "Image generation returned no image" }, { status: 502 });

  const buffer = Buffer.from(imageB64, "base64");
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const baseName = title.toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "article";
  const path = `${baseName}-${Date.now()}.${ext}`;

  const admin = serverClient();
  const { error: uploadError } = await admin.storage.from("article-images").upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[article-image] upload failed", { path, error: uploadError.message });
    return NextResponse.json({ error: `Failed to store image: ${uploadError.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("article-images").getPublicUrl(path);
  return NextResponse.json({ prompt, imageUrl: pub.publicUrl });
}
