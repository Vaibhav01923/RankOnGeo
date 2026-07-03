import { NextRequest } from "next/server";
import { AIEngine } from "@/lib/types";
import { clientFromRequest } from "@/lib/supabase";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const { brandId, engines, promptIds }: { brandId: string; engines: AIEngine[]; promptIds?: string[] } = await req.json();

  if (!brandId || !engines?.length) {
    return new Response(JSON.stringify({ error: "brandId and engines are required" }), { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { data: brandRow } = await db
    .from("brands").select("id").eq("id", brandId).eq("user_id", user.id).single();
  if (!brandRow) return new Response(JSON.stringify({ error: "Brand not found" }), { status: 404 });

  // Create scan_run row so the client has an ID to poll immediately
  const { data: runRow, error: runError } = await db
    .from("scan_runs")
    .insert({ brand_id: brandId, engines, overall_score: 0 })
    .select("id")
    .single();

  if (runError || !runRow) {
    return new Response(JSON.stringify({ error: runError?.message ?? "Failed to create scan run" }), { status: 500 });
  }

  // Fire Inngest event — returns immediately, Inngest does the work in background
  await inngest.send({
    name: "scan/manual.requested",
    data: { brandId, scanRunId: runRow.id, engines, promptIds: promptIds ?? null },
  });

  return new Response(JSON.stringify({ scanRunId: runRow.id }), {
    headers: { "Content-Type": "application/json" },
  });
}
