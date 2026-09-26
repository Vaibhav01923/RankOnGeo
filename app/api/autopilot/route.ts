import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";

const DEFAULTS = { enabled: false, channelId: null as string | null, postsPerWeek: 2, publishMode: "publish" as "publish" | "draft", autoRewrite: true };

// Settings + what Autopilot has been doing, for the Publishing tab. Reads go
// through the service role after the brand-access check — the underlying
// tables have no client policies.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  const [{ data: s }, { data: channels }, { data: queue }, { data: log }, { count: postCount }] = await Promise.all([
    admin.from("autopilot_settings").select("*").eq("brand_id", brandId).maybeSingle(),
    admin.from("publishing_channels").select("id, name, type, status").eq("brand_id", brandId).order("created_at", { ascending: true }),
    admin.from("autopilot_topics").select("keyword, source").eq("brand_id", brandId).eq("status", "queued").order("created_at", { ascending: true }).limit(200),
    admin.from("publishing_log").select("article_title, status, error_message, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(8),
    admin.from("articles").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("source", "autopilot"),
  ]);

  return NextResponse.json({
    settings: s
      ? { enabled: s.enabled, channelId: s.channel_id, postsPerWeek: s.posts_per_week, publishMode: s.publish_mode, autoRewrite: s.auto_rewrite, lastRunAt: s.last_run_at, lastError: s.last_error }
      : { ...DEFAULTS, lastRunAt: null, lastError: null },
    channels: channels ?? [],
    queuedTopics: queue?.length ?? 0,
    nextTopics: (queue ?? []).slice(0, 5),
    postCount: postCount ?? 0,
    activity: log ?? [],
    isPaid: !(await requiresPaywall(admin, access.ownerId)),
  });
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const brandId = body.brandId as string | undefined;
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  if (await requiresPaywall(admin, access.ownerId)) {
    return NextResponse.json({ error: "Autopilot is part of the paid plan.", reason: "upgrade" }, { status: 402 });
  }

  const { data: existing } = await admin.from("autopilot_settings").select("*").eq("brand_id", brandId).maybeSingle();
  const next = {
    enabled: body.enabled ?? existing?.enabled ?? DEFAULTS.enabled,
    channel_id: body.channelId !== undefined ? body.channelId : existing?.channel_id ?? null,
    posts_per_week: body.postsPerWeek ?? existing?.posts_per_week ?? DEFAULTS.postsPerWeek,
    publish_mode: body.publishMode ?? existing?.publish_mode ?? DEFAULTS.publishMode,
    auto_rewrite: body.autoRewrite ?? existing?.auto_rewrite ?? DEFAULTS.autoRewrite,
  };

  if (!Number.isInteger(next.posts_per_week) || next.posts_per_week < 1 || next.posts_per_week > 7) {
    return NextResponse.json({ error: "postsPerWeek must be between 1 and 7" }, { status: 400 });
  }
  if (next.publish_mode !== "publish" && next.publish_mode !== "draft") {
    return NextResponse.json({ error: "publishMode must be publish or draft" }, { status: 400 });
  }
  if (next.channel_id) {
    // A channel id from another brand would let one workspace publish through
    // another's site credentials — it has to belong to this brand.
    const { data: channel } = await admin.from("publishing_channels").select("id").eq("id", next.channel_id).eq("brand_id", brandId).maybeSingle();
    if (!channel) return NextResponse.json({ error: "Channel not found for this brand" }, { status: 400 });
  }
  if (next.enabled && next.publish_mode === "publish" && !next.channel_id) {
    return NextResponse.json({ error: "Pick where to publish first — or choose “save as drafts”.", reason: "no_channel" }, { status: 400 });
  }

  const { error } = await admin.from("autopilot_settings").upsert({ brand_id: brandId, ...next, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
