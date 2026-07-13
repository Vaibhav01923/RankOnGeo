import { NextRequest } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { placeRedditOrder } from "@/lib/reddit-order-service";
import { requireBrandAccess } from "@/lib/team";
import type { RedditServiceType } from "@/lib/types";

const SERVICE_TYPES: RedditServiceType[] = ["post_upvote", "post_downvote", "comment_upvote", "comment_downvote", "custom_comments"];

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }
  const { brandId, url, serviceType, quantity, commentText, speed } = body;

  if (!brandId || !url) return new Response(JSON.stringify({ error: "brandId and url required" }), { status: 400 });
  if (!SERVICE_TYPES.includes(serviceType)) {
    return new Response(JSON.stringify({ error: "Invalid service type" }), { status: 400 });
  }

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return new Response(JSON.stringify({ error: "Brand not found" }), { status: 404 });

  const result = await placeRedditOrder({
    db,
    userId: user.id,
    billingUserId: access.ownerId,
    brandId,
    url,
    serviceType,
    quantity,
    commentText,
    speed,
  });

  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: result.status });
  return new Response(JSON.stringify({ task: result.task, queued: result.queued }), { status: 201, headers: { "Content-Type": "application/json" } });
}
