-- Adds a fifth funnel_events type: acquisition_source. Captured optionally
-- while a landing-page visitor's site analysis is running (an idle ~10-20s
-- window), answering "how did you hear about us" — surfaced in /admin/stats
-- as its own breakdown, not joined back to a specific domain_submitted row.

alter table public.funnel_events drop constraint funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check
  check (event_type in (
    'domain_submitted', 'trial_checkout_started', 'trial_started', 'trial_converted', 'acquisition_source'
  ));
