// Wizard edits for an anonymous /setup visitor survive here (not
// sessionStorage — Supabase's email-confirmation link can open in a new
// tab) until /api/brand/claim attaches them to whichever account confirms
// next. Read by both app/setup/page.tsx (immediate-session case) and
// ClaimPendingBrand (resumes wherever the confirmation link actually lands).
const PENDING_EDITS_KEY = "pendingBrandEdits";
const PENDING_EDITS_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingBrandEdits = {
  name: string;
  niche: string;
  competitors: string[];
  targetAudience: string[];
  prompts: { id?: string; text: string; category: string }[];
  ts: number;
};

export function stashPendingBrandEdits(edits: Omit<PendingBrandEdits, "ts">) {
  localStorage.setItem(PENDING_EDITS_KEY, JSON.stringify({ ...edits, ts: Date.now() }));
}

export function readPendingBrandEdits(): PendingBrandEdits | null {
  const raw = localStorage.getItem(PENDING_EDITS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingBrandEdits;
    if (Date.now() - parsed.ts > PENDING_EDITS_TTL_MS) {
      localStorage.removeItem(PENDING_EDITS_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(PENDING_EDITS_KEY);
    return null;
  }
}

export function clearPendingBrandEdits() {
  localStorage.removeItem(PENDING_EDITS_KEY);
}

export type ClaimResult = { claimed: boolean; brandId?: string; existingBrandId?: string | null };

// POSTs whatever pending edits are on hand (if any) to /api/brand/claim and
// clears local storage regardless of outcome — a failed/no-op claim just
// means there was nothing to claim (already claimed, expired, or none set).
export async function claimPendingBrand(): Promise<ClaimResult> {
  const pending = readPendingBrandEdits();
  const res = await fetch("/api/brand/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      pending
        ? {
            edits: {
              name: pending.name,
              niche: pending.niche,
              competitors: pending.competitors,
              targetAudience: pending.targetAudience,
              prompts: pending.prompts,
            },
          }
        : {}
    ),
  }).catch(() => null);
  clearPendingBrandEdits();
  if (!res || !res.ok) return { claimed: false };
  return res.json();
}
