import type { NextRequest } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";

// Resolves the requesting user and verifies their email is in the admins
// table. Returns null when unauthenticated or not an admin.
export async function requireAdmin(req: NextRequest): Promise<{ email: string } | null> {
  const {
    data: { user },
  } = await clientFromRequest(req).auth.getUser();
  if (!user?.email) return null;

  const { data: adminRow } = await serverClient()
    .from("admins")
    .select("email")
    .eq("email", user.email)
    .maybeSingle();

  return adminRow ? { email: user.email } : null;
}
