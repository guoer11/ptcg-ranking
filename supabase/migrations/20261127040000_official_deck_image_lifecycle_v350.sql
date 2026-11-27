-- Image lifecycle is independent of the permanent 60-card recipes and match archives.
alter table public.official_deck_recipes add column if not exists preview_path text;
alter table public.official_deck_recipes add column if not exists preview_next_attempt_at timestamptz not null default now();
update storage.buckets set allowed_mime_types=array['image/png','image/jpeg'] where id='official-deck-images';
create or replace view public.official_deck_index with (security_invoker=true) as
 select e.event_id,e.player_id,e.code,t.event_date,t.title,t.league,t.division,
 r.image_path,r.captured_at,e.override_catalog_id,coalesce(c.name,public.official_deck_classification(r.cards)) as deck_name,
 case when e.override_catalog_id is not null then 'manual' when r.cards is not null then 'auto' else 'pending' end as label_source,r.preview_path
 from public.official_deck_entries e join public.official_deck_events t on t.event_id=e.event_id
 join public.official_deck_recipes r on r.code=e.code left join public.pairing_deck_catalog c on c.id=e.override_catalog_id;
create table if not exists public.official_deck_image_policy(
 singleton boolean primary key default true check(singleton), rotation_date date
);
alter table public.official_deck_image_policy enable row level security;
revoke all on public.official_deck_image_policy from public,anon,authenticated;
grant select,insert,update on public.official_deck_image_policy to service_role;
insert into public.official_deck_image_policy(singleton) values(true) on conflict do nothing;
create or replace function public.official_deck_image_jobs(p_mode text,p_limit integer default 20)
returns table(code text,image_path text,preview_path text,active boolean,preview_next_attempt_at timestamptz)
language sql stable security invoker set search_path='' as $$
 with latest as (
 select e.code,max(t.event_date) as event_date
 from public.official_deck_entries e join public.official_deck_events t using(event_id)
 group by e.code
 ), jobs as (
 select r.code,r.image_path,r.preview_path,r.preview_next_attempt_at,
 coalesce((l.event_date+interval '3 months')::date>(now() at time zone 'Asia/Taipei')::date
 and l.event_date>=coalesce((select rotation_date from public.official_deck_image_policy where singleton),'-infinity'::date),false) as active
 from public.official_deck_recipes r join latest l on l.code=r.code where r.cards is not null
 )
 select j.code,j.image_path,j.preview_path,j.active,j.preview_next_attempt_at from jobs j
 where (p_mode='preview' and j.active and j.preview_path is null and j.preview_next_attempt_at<=now())
 or (p_mode='cleanup' and (j.image_path is not null and (not j.active or j.preview_path is not null) or not j.active and j.preview_path is not null))
 or (p_mode='one' and false)
 order by case when j.active then 1 else 0 end,j.code limit least(greatest(p_limit,1),200);
$$;
revoke all on function public.official_deck_image_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.official_deck_image_jobs(text,integer) to service_role;
-- Daily 02:15 Taiwan time. Storage API (not SQL DELETE) performs physical object removal.
select cron.schedule('ptcg-official-deck-image-cleanup','15 18 * * *',$job$
 select net.http_post(
 url:='https://ceobnyikrudlxasyjukg.supabase.co/functions/v1/ptcg-official-deck-archive',
 headers:=jsonb_build_object('Content-Type','application/json','x-ptcg-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='ptcg_cron_trigger_secret' limit 1)),
 body:='{"action":"cleanup"}'::jsonb,timeout_milliseconds:=120000);
$job$);
