-- First observed official results receive a durable priority flag.
alter table public.official_deck_events add column first_results_at timestamptz,
 add column result_check_pending boolean not null default false;
create index official_deck_due_priority_idx on public.official_deck_events(result_check_pending desc,next_check_at);
-- Refresh recent events within an hour, without pushing back earlier checks.
update public.official_deck_events set next_check_at=least(next_check_at,now()+interval '1 hour')
 where event_date >= (now() at time zone 'Asia/Taipei')::date-7;
select cron.alter_job(10,schedule:='*/30 * * * *');
