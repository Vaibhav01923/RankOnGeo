import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

// Opened by clicking the "Mark as Done" link button in the Discord task
// notification (see lib/reddit-task-discord.ts) — a plain browser navigation,
// not a JSON API call, hence the HTML response. The token is a random
// per-task secret (engage_tasks.mark_done_token) so only someone with the
// Discord message can complete a task, not anyone who can guess a task id.
export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get("taskId");
  const token = req.nextUrl.searchParams.get("token");
  if (!taskId || !token) return htmlResponse("Missing task or token.", 400);

  const db = serverClient();
  const { data: task } = await db
    .from("engage_tasks")
    .select("id, status, mark_done_token")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || !task.mark_done_token || task.mark_done_token !== token) {
    return htmlResponse("Invalid or expired link.", 404);
  }
  if (task.status === "completed") {
    return htmlResponse("This task was already marked as done. ✅", 200);
  }

  await db.from("engage_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", taskId);
  return htmlResponse("Marked as done. ✅ You can close this tab.", 200);
}

function htmlResponse(message: string, status: number) {
  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f2e9;color:#302821;"><p style="font-size:18px;">${message}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html" } }
  );
}
