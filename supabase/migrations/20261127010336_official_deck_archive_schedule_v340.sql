-- Run independently of the 5-second pairing watcher and the existing tournament scraper.
select cron.schedule('ptcg-official-deck-sync','30 4,9,16 * * *',$job$
 select net.http_post(
 url:='https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-official-deck-archive',
 headers:=jsonb_build_object('Content-Type','application/json','x-ptcg-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='ptcg_cron_trigger_secret' limit 1)),
 body:='{"action":"sync"}'::jsonb,timeout_milliseconds:=120000);
$job$);
select cron.schedule('ptcg-official-deck-poll','*/5 * * * *',$job$
 select net.http_post(
 url:='https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-official-deck-archive',
 headers:=jsonb_build_object('Content-Type','application/json','x-ptcg-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='ptcg_cron_trigger_secret' limit 1)),
 body:='{"action":"poll"}'::jsonb,timeout_milliseconds:=120000);
$job$);
-- 10/03: date, Ultra Junior division and all 32 official result IDs verified against 109 Swiss standings.
insert into public.official_deck_event_map(tid,event_id) values('937076','66954') on conflict(tid) do nothing;
-- Existing archived events first, without changing the actual tournament dates.
update public.official_deck_events set next_check_at=now()-interval '2 days' where event_id in(select event_id from public.official_deck_event_map) and checked_at is null;
