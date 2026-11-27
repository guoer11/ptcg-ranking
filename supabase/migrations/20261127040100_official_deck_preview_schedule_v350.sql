-- Preserve the independently scheduled JPG encoder; it no longer requires a stored PNG.
select cron.schedule('ptcg-official-deck-preview','* * * * *',$job$
 select net.http_post(
 url:='https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-official-deck-preview',
 headers:=jsonb_build_object('Content-Type','application/json','x-ptcg-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='ptcg_cron_trigger_secret' limit 1)),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
