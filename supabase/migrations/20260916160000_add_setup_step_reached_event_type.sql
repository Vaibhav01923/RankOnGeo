-- Adds a sixth funnel_events type: setup_step_reached. One row per visitor
-- per /setup wizard step actually reached (see app/api/track/step and
-- app/setup/page.tsx's trackStep) — step number and name in metadata,
-- surfaced in /admin/stats as a step-by-step funnel.

alter table public.funnel_events drop constraint funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check
  check (event_type in (
    'domain_submitted', 'trial_checkout_started', 'trial_started', 'trial_converted',
    'acquisition_source', 'setup_step_reached'
  ));
