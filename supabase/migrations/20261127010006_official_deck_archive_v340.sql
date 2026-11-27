-- Independent official deck archive; no writes to scouting, standings or LP.
create table public.official_deck_events(
 event_id text primary key check(event_id ~ '^[0-9]{1,12}$'),
 event_date date not null, title text not null, league text not null, division text not null,
 checked_at timestamptz, next_check_at timestamptz not null default now()
);
create table public.official_deck_event_map(
 tid text primary key check(tid ~ '^[0-9]{1,12}$'),
 event_id text not null references public.official_deck_events(event_id)
);
create table public.official_deck_recipes(
 code text primary key check(code ~ '^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$'),
 cards jsonb check(cards is null or jsonb_typeof(cards)='array'),
 image_path text check(image_path is null or image_path=code||'.png'),
 captured_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts>=0)
);
create table public.official_deck_entries(
 event_id text not null references public.official_deck_events(event_id),
 player_id text not null check(player_id ~ '^tw[0-9]{1,16}$'),
 code text not null references public.official_deck_recipes(code),
 discovered_at timestamptz not null default now(),
 override_catalog_id bigint references public.pairing_deck_catalog(id) on delete set null,
 primary key(event_id,player_id)
);
create index official_deck_entries_player_idx on public.official_deck_entries(player_id,event_id);
create index official_deck_entries_code_idx on public.official_deck_entries(code);
create index official_deck_entries_override_idx on public.official_deck_entries(override_catalog_id);
create index official_deck_map_event_idx on public.official_deck_event_map(event_id);
create table public.official_deck_rules(
 catalog_id bigint primary key references public.pairing_deck_catalog(id) on delete cascade,
 required jsonb not null check(jsonb_typeof(required)='object' and required<>'{}'::jsonb and octet_length(required::text)<=4000),
 priority integer not null default 10 check(priority between 1 and 1000)
);
do $$declare t text;begin
 foreach t in array array['official_deck_events','official_deck_event_map','official_deck_recipes','official_deck_entries','official_deck_rules'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy member_read on public.%I for select to authenticated using ((select private.pairing_is_member(auth.uid())))',t);
 end loop;
end$$;
grant insert,update,delete on public.official_deck_rules to authenticated;
create policy admin_rules on public.official_deck_rules for all to authenticated
 using ((select private.pairing_is_admin(auth.uid())))
 with check ((select private.pairing_is_admin(auth.uid())) and exists(select 1 from public.pairing_deck_catalog c where c.id=catalog_id and c.user_id=(select auth.uid())));
grant update(override_catalog_id) on public.official_deck_entries to authenticated;
create policy admin_override on public.official_deck_entries for update to authenticated
 using ((select private.pairing_is_admin(auth.uid())))
 with check ((select private.pairing_is_admin(auth.uid())) and (override_catalog_id is null or exists(select 1 from public.pairing_deck_catalog c where c.id=override_catalog_id and c.user_id=(select auth.uid()))));
-- Exact card names and minimum counts. Equal-priority ambiguous matches remain unclassified.
create function public.official_deck_classification(p_cards jsonb) returns text
 language sql stable security invoker set search_path='' as $$
 with counts as (
 select c->>'name' as name,sum(case when c->>'count' ~ '^[0-9]{1,2}$' then (c->>'count')::int else 0 end) as n
 from jsonb_array_elements(coalesce(p_cards,'[]'::jsonb)) c group by 1
 ), matches as (
 select r.priority,c.name from public.official_deck_rules r join public.pairing_deck_catalog c on c.id=r.catalog_id
 where not exists(select 1 from jsonb_each_text(r.required) q left join counts n on n.name=q.key
 where case when q.value ~ '^[1-9][0-9]?$' then coalesce(n.n,0)<q.value::int else true end)
 ), best as (select distinct name from matches where priority=(select max(priority) from matches))
 select case when count(*)=1 then min(name) end from best;
 $$;
revoke all on function public.official_deck_classification(jsonb) from public,anon,authenticated;
grant execute on function public.official_deck_classification(jsonb) to authenticated,service_role;
create view public.official_deck_index with (security_invoker=true) as
 select e.event_id,e.player_id,e.code,t.event_date,t.title,t.league,t.division,
 r.image_path,r.captured_at,e.override_catalog_id,coalesce(c.name,public.official_deck_classification(r.cards)) as deck_name,
 case when e.override_catalog_id is not null then 'manual' when r.cards is not null then 'auto' else 'pending' end as label_source
 from public.official_deck_entries e join public.official_deck_events t on t.event_id=e.event_id
 join public.official_deck_recipes r on r.code=e.code left join public.pairing_deck_catalog c on c.id=e.override_catalog_id;
revoke all on public.official_deck_index from public,anon,authenticated;
grant select on public.official_deck_index to authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('official-deck-images','official-deck-images',false,8388608,array['image/png']);
create policy official_deck_image_member_read on storage.objects for select to authenticated
 using(bucket_id='official-deck-images' and (select private.pairing_is_member(auth.uid())));
-- Conservative initial rules based on the owner's current catalog; editable, not assertions about all decks.
insert into public.official_deck_rules(catalog_id,required,priority)
 select c.id, seed.required,seed.priority from public.pairing_deck_catalog c join (values
 ('魔靈多龍','{"多龍巴魯托ex":2,"黑夜魔靈":1}'::jsonb,30),
 ('忍蛙多龍','{"甲賀忍蛙ex":2,"多龍巴魯托ex":2}'::jsonb,40),
 ('火焰雞多龍','{"多龍巴魯托ex":2,"火焰雞ex":1}'::jsonb,30),
 ('土龍多龍','{"多龍巴魯托ex":2,"土龍節節":2}'::jsonb,30),
 ('忍蛙土龍','{"甲賀忍蛙ex":2,"土龍節節":2}'::jsonb,30),
 ('忍蛙魔靈','{"甲賀忍蛙ex":2,"黑夜魔靈":1}'::jsonb,30),
 ('胡地魔靈','{"胡地":2,"黑夜魔靈":1}'::jsonb,30),
 ('胡地(土龍)','{"胡地":2,"土龍節節":2}'::jsonb,30),
 ('N的索羅亞克','{"N的索羅亞克ex":3}'::jsonb,20),
 ('瑪俐的長毛巨魔','{"瑪俐的長毛巨魔ex":2}'::jsonb,20),
 ('超級龍頭地鼠','{"超級龍頭地鼠ex":2}'::jsonb,20),
 ('超級長耳兔','{"超級長耳兔ex":2}'::jsonb,20),
 ('竹蘭的烈咬陸鯊','{"竹蘭的烈咬陸鯊ex":2}'::jsonb,20),
 ('蒼炎刃鬼','{"蒼炎刃鬼ex":2}'::jsonb,20),
 ('沙奈朵','{"沙奈朵ex":2}'::jsonb,20),
 ('超級巨牙鯊','{"超級巨牙鯊ex":2}'::jsonb,20),
 ('超級烈咬陸鯊Z','{"超級烈咬陸鯊Zex":2}'::jsonb,20)
 ) seed(name,required,priority) on seed.name=c.name where private.pairing_is_admin(c.user_id)
 on conflict(catalog_id) do nothing;
