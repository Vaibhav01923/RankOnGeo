import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client with auth session persistence — use this in all client components
export function createSupabaseBrowserClient() {
  return createBrowserClient(url, anonKey);
}

// Server-side client for API routes — uses service role key to bypass RLS
export function serverClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceKey?.startsWith("eyJ") ? serviceKey : anonKey;
  return createClient(url, key);
}

// Legacy export kept for backwards compat
export const supabase = createClient(url, anonKey);
