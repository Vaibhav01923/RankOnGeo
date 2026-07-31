import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const MAX_BYTES = 25 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

// Media attached to "create a new post" Reddit tasks — stored in the
// separate public "task-uploads" bucket (Supabase's own storage domain, not
// rankongeo.com) so user-uploaded content is never served from a path under
// our own SEO-relevant domain.
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
  if (!ext) return NextResponse.json({ error: "Unsupported file type — use PNG, JPEG, WebP, GIF, MP4, WebM, or MOV" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 25MB)" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${brandId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const admin = serverClient();
  const { error: uploadError } = await admin.storage.from("task-uploads").upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("[tasks-upload-media] upload failed", { path, error: uploadError.message });
    return NextResponse.json({ error: `Failed to store file: ${uploadError.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("task-uploads").getPublicUrl(path);
  return NextResponse.json({ mediaUrl: pub.publicUrl });
}
