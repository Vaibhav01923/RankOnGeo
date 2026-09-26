-- Adds a funnel_events type for what visitors do on the wizard's offer step
-- (step 7): finished watching the features, clicked continue, emailed for the
-- backlink, went back. The action name is in metadata.action; see
-- app/api/track/step and app/setup/OfferStep.tsx.

alter table public.funnel_events drop constraint funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check
  check (event_type in (
    'domain_submitted', 'trial_checkout_started', 'trial_started', 'trial_converted',
    'acquisition_source', 'setup_step_reached', 'setup_offer_action'
  ));
