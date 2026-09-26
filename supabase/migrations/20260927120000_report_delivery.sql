-- Each alert destination now says what it wants: instant scan alerts, the weekly report,
-- the monthly report. Existing destinations keep their scan alerts and opt in to reports.
alter table public.alert_destinations
  add column if not exists scan_alerts boolean not null default true,
  add column if not exists weekly_report boolean not null default false,
  add column if not exists monthly_report boolean not null default false;

-- Which period a report delivery was for ("2026-W39" / "2026-09"), so a retried or
-- doubled scheduler run can never send the same report to the same place twice.
alter table public.alert_deliveries add column if not exists period_key text;
create unique index if not exists alert_deliveries_report_once_idx
  on public.alert_deliveries (destination_id, event_type, period_key)
  where period_key is not null and status = 'succeeded';
