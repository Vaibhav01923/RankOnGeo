"use client";

export type OnboardingItem = {
  id: string;
  title: string;
  body: string;
  done: boolean;
  cta: string;
  onClick: () => void;
  // Nice-to-have, not counted towards "set up".
  optional?: boolean;
};

export function OnboardingChecklist({ items, onDismiss, onOpenGuide }: { items: OnboardingItem[]; onDismiss: () => void; onOpenGuide?: () => void }) {
  const core = items.filter((i) => !i.optional);
  const doneCount = core.filter((i) => i.done).length;

  return (
    <div className="panel rounded-2xl p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Get the most out of RankOnGeo</p>
          <p className="text-xs text-[var(--ink-faint)] mt-0.5">{doneCount} of {core.length} set up</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {onOpenGuide && <button onClick={onOpenGuide} className="text-xs font-semibold text-[var(--rust)] hover:text-[var(--rust-deep)]">How it works</button>}
          <button onClick={onDismiss} aria-label="Hide this checklist" className="text-xs text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">Hide</button>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--line-soft)] overflow-hidden mb-4">
        <div className="h-full rounded-full bg-[var(--rust)] transition-all" style={{ width: `${core.length ? (doneCount / core.length) * 100 : 0}%` }} />
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 border border-[var(--line)] rounded-xl px-3.5 py-3 bg-[var(--surface)]">
            <span
              className={`mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${
                item.done ? "bg-[var(--olive)] text-[var(--surface)]" : "border border-[var(--line)] text-transparent"
              }`}
              aria-hidden="true"
            >
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {item.title}
                {item.optional && <span className="ml-2 text-[10px] font-medium text-[var(--ink-faint)] uppercase tracking-wide">Optional</span>}
              </p>
              <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-0.5">{item.body}</p>
            </div>
            {!item.done && (
              <button onClick={item.onClick} className="shrink-0 text-xs font-semibold text-[var(--rust)] hover:text-[var(--rust-deep)] whitespace-nowrap self-center">
                {item.cta} →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
