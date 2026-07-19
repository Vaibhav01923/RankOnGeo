import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Customer-facing counterpart to app/api/admin/blog/upload-image/route.ts —
// same shape, but auth'd via brand ownership (requireBrandAccess) instead of
// requireAdmin, and stored in the separate "article-images" bucket.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const brandId = form?.get("brandId");
  if (typeof brandId !== "string" || !brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) return NextResponse.json({ error: "Unsupported image type — use PNG, JPEG, WebP, or GIF" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large (max 8MB)" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const baseName = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "image";
  const path = `${baseName}-${Date.now()}.${ext}`;

  const admin = serverClient();
  const { error: uploadError } = await admin.storage.from("article-images").upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("[article-upload-image] upload failed", { path, error: uploadError.message });
    return NextResponse.json({ error: `Failed to store image: ${uploadError.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("article-images").getPublicUrl(path);
  return NextResponse.json({ imageUrl: pub.publicUrl });
}
