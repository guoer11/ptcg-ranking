-- Keep existing card requirements and legacy numeric priorities intact.
-- Existing and new rules default to automatic specificity-based matching.
alter table public.official_deck_rules add column priority_mode text not null default 'auto'
 check (priority_mode in ('auto','high','low'));
create or replace function public.official_deck_classification(p_cards jsonb) returns text
 language sql stable security invoker set search_path='' as $$
 with counts as (
  select c->>'name' as name,sum(case when c->>'count' ~ '^[0-9]{1,2}$' then (c->>'count')::int else 0 end) as n
  from jsonb_array_elements(coalesce(p_cards,'[]'::jsonb)) c group by 1
 ), matches as (
  select case r.priority_mode when 'high' then 2 when 'low' then 0 else 1 end as tier,
   (select count(*) from jsonb_object_keys(r.required)) as specificity,c.name
  from public.official_deck_rules r join public.pairing_deck_catalog c on c.id=r.catalog_id
  where not exists(select 1 from jsonb_each_text(r.required) q left join counts n on n.name=q.key
   where case when q.value ~ '^[1-9][0-9]?$' then coalesce(n.n,0)<q.value::int else true end)
 ), ranked as (
  select name,dense_rank() over(order by tier desc,specificity desc) as preference from matches
 ), best as (select distinct name from ranked where preference=1)
 select case when count(*)=1 then min(name) end from best;
 $$;
revoke all on function public.official_deck_classification(jsonb) from public,anon,authenticated;
grant execute on function public.official_deck_classification(jsonb) to authenticated,service_role;
