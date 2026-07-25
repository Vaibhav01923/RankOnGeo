import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";

// Optional "how did you hear about us" answer, captured while a landing-page
// visitor's site analysis is running (see app/setup/page.tsx step 1) — not
// joined back to a specific domain_submitted row, just its own aggregate
// breakdown on /admin/stats.
export async function POST(req: NextRequest) {
  const { domain, source } = await req.json().catch(() => ({}));
  if (!source || typeof source !== "string") {
    return NextResponse.json({ error: "source is required" }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();

  await serverClient().from("funnel_events").insert({
    event_type: "acquisition_source",
    domain: typeof domain === "string" ? domain.slice(0, 200) : null,
    user_id: user?.id ?? null,
    is_anonymous: !user,
    metadata: { source: source.slice(0, 200) },
  });

  return NextResponse.json({ ok: true });
}
