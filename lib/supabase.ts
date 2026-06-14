import { createClient } from "@supabase/supabase-js";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client with auth session persistence — use this in all client components
export function createSupabaseBrowserClient() {
  return createBrowserClient(url(), anonKey());
}

// API route client — reads the user's session cookies from the request so auth.uid() works with RLS
export function clientFromRequest(req: NextRequest) {
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() {},
    },
  });
}

// Server-side client — uses service role key if configured, otherwise falls back to anon key
export function serverClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceKey?.startsWith("eyJ") ? serviceKey : anonKey();
  return createClient(url(), key);
}

// Legacy export kept for backwards compat
export const supabase = {
  get auth() { return createClient(url(), anonKey()).auth; }
};
