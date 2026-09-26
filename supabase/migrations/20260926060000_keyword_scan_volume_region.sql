-- Which region a cached keyword-volume list was measured for. Rows saved before
-- this column existed are US-only (null); new ones are worldwide.
alter table public.keyword_opportunity_scans add column if not exists volume_region text;
