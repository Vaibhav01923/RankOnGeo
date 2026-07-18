"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { readPendingBrandEdits, claimPendingBrand } from "@/lib/pending-brand";

// Catches the visitor who finished the /setup wizard anonymously, then
// confirmed their email and landed back on the site wherever Supabase's
// default confirmation redirect drops them (not necessarily /dashboard) —
// resumes the claim from there. Cheap no-op on every other page load: bails
// on a localStorage read before ever hitting the network, and that entry is
// cleared the moment a real claim attempt runs (success or not), so this
// naturally stops firing once there's nothing left to resume.
export function ClaimPendingBrand() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!readPendingBrandEdits()) return;
    let cancelled = false;

    createSupabaseBrowserClient()
      .auth.getUser()
      .then(async ({ data: { user } }) => {
        if (!user || cancelled) return;
        const result = await claimPendingBrand();
        if (cancelled) return;
        const brandId = result.claimed ? result.brandId : result.existingBrandId;
        if (brandId && pathname !== "/dashboard") router.push(`/dashboard?brandId=${brandId}`);
      });

    return () => { cancelled = true; };
  }, [pathname, router]);

  return null;
}
