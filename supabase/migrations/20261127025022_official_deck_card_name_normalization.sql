-- Match official card names consistently without modifying archived cards or user rules.
-- Ignore ASCII/fullwidth angle brackets and trim surrounding whitespace only.
-- Preserve all other characters (including internal spaces and ex suffix).
create or replace function public.official_deck_classification(p_cards jsonb) returns text
 language sql stable security invoker set search_path='' as $$
 with counts as (
  select btrim(translate(c->>'name','<>＜＞',''),E' \t\r\n'||chr(12288)||chr(160)) as name,
   sum(case when c->>'count' ~ '^[0-9]{1,2}$' then (c->>'count')::int else 0 end) as n
  from jsonb_array_elements(coalesce(p_cards,'[]'::jsonb)) c group by 1
 ), conditions as (
  select r.catalog_id,
   btrim(translate(q.key,'<>＜＞',''),E' \t\r\n'||chr(12288)||chr(160)) as card_name,
   q.value as minimum
  from public.official_deck_rules r cross join lateral jsonb_each_text(r.required) q
 ), matches as (
  select case r.priority_mode when 'high' then 2 when 'low' then 0 else 1 end as tier,
   (select count(distinct q.card_name) from conditions q where q.catalog_id=r.catalog_id) as specificity,c.name
  from public.official_deck_rules r join public.pairing_deck_catalog c on c.id=r.catalog_id
  where not exists(select 1 from conditions q left join counts n on n.name=q.card_name
   where q.catalog_id=r.catalog_id and
    case when q.card_name<>'' and q.minimum ~ '^[1-9][0-9]?$' then coalesce(n.n,0)<q.minimum::int else true end)
 ), ranked as (
  select name,dense_rank() over(order by tier desc,specificity desc) as preference from matches
 ), best as (select distinct name from ranked where preference=1)
 select case when count(*)=1 then min(name) end from best;
 $$;
