import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { notifyDiscordOfComplaint } from "@/lib/task-complaint-discord";

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId, message } = await req.json().catch(() => ({}));
  const trimmedMessage = (message ?? "").trim();
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  if (!trimmedMessage || trimmedMessage.length > 2000) {
    return NextResponse.json({ error: "Message is required and must be 2000 characters or fewer" }, { status: 400 });
  }

  const { data: task } = await db
    .from("engage_tasks")
    .select("id, brand_id, url, service_type")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Task history is a whole-workspace view (teammates see each other's
  // orders), so brand access — not strict task ownership — is the right
  // gate here, matching GET /api/tasks.
  const access = await requireBrandAccess(db, user.id, task.brand_id, "name");
  if (!access) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { data: complaint, error } = await db
    .from("task_complaints")
    .insert({ task_id: taskId, user_id: user.id, message: trimmedMessage })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const brand = access.brand as unknown as { name: string };
  await notifyDiscordOfComplaint({
    taskId,
    taskUrl: task.url,
    serviceType: task.service_type,
    brandName: brand.name,
    userEmail: user.email ?? "unknown",
    message: trimmedMessage,
  });

  return NextResponse.json({ complaint }, { status: 201 });
}
