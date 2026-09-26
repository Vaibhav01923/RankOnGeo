-- A customer can reorder Autopilot's writing queue. A topic with a position is
-- written before any topic without one, lowest position first; topics added later
-- have no position and follow in the normal order.
alter table public.autopilot_topics add column if not exists position integer;
