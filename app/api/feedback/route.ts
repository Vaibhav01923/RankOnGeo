import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

const CATEGORIES = ["feature_request", "bug_report", "improvement", "other"];

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("feedback")
    .select("id, category, title, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { category, title, description } = await req.json();

  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  const trimmedTitle = (title ?? "").trim();
  const trimmedDescription = (description ?? "").trim();
  if (!trimmedTitle || trimmedTitle.length > 200) {
    return NextResponse.json({ error: "Title is required and must be 200 characters or fewer" }, { status: 400 });
  }
  if (!trimmedDescription || trimmedDescription.length > 2000) {
    return NextResponse.json({ error: "Description is required and must be 2000 characters or fewer" }, { status: 400 });
  }

  const { data, error } = await db
    .from("feedback")
    .insert({ user_id: user.id, category, title: trimmedTitle, description: trimmedDescription })
    .select("id, category, title, description, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submission: data }, { status: 201 });
}
