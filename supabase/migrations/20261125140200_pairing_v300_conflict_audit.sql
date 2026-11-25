-- Keep an immutable audit trail of changes and administrator conflict decisions.
create table private.pairing_scout_audit(id bigint generated always as identity primary key, table_name text not null, op text not null, actor uuid, old_row jsonb, new_row jsonb, changed_at timestamptz not null default now());
revoke all on private.pairing_scout_audit from public,anon,authenticated;
create function private.pairing_audit_scout() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.pairing_scout_audit(table_name,op,actor,old_row,new_row) values(TG_TABLE_NAME,TG_OP,auth.uid(),case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function private.pairing_audit_scout() from public,anon,authenticated;
create trigger pairing_scout_audit after insert or update or delete on public.pairing_deck_scouts for each row execute function private.pairing_audit_scout();
create trigger pairing_pair_audit after insert or update or delete on public.pairing_deck_pair_observations for each row execute function private.pairing_audit_scout();

create table public.pairing_scout_resolutions(tid text not null,player_id text not null,deck_name text not null, resolved_by uuid not null, resolved_at timestamptz not null default now(),primary key(tid,player_id));
alter table public.pairing_scout_resolutions enable row level security;
revoke all on public.pairing_scout_resolutions from public,anon,authenticated;
grant select,insert,update,delete on public.pairing_scout_resolutions to authenticated;
create policy read_member on public.pairing_scout_resolutions for select to authenticated using(private.pairing_is_member(auth.uid()));
create policy insert_admin on public.pairing_scout_resolutions for insert to authenticated with check(private.pairing_is_admin(auth.uid()) and resolved_by=auth.uid());
create policy update_admin on public.pairing_scout_resolutions for update to authenticated using(private.pairing_is_admin(auth.uid())) with check(private.pairing_is_admin(auth.uid()) and resolved_by=auth.uid());
create policy delete_admin on public.pairing_scout_resolutions for delete to authenticated using(private.pairing_is_admin(auth.uid()));

create table public.pairing_pair_resolutions(tid text not null,round_no integer not null,table_no text not null,chosen_user_id uuid not null,deck_a text not null,deck_b text not null,player_a_id text not null,player_b_id text not null,resolved_by uuid not null,resolved_at timestamptz not null default now(),primary key(tid,round_no,table_no));
alter table public.pairing_pair_resolutions enable row level security;
revoke all on public.pairing_pair_resolutions from public,anon,authenticated;
grant select,insert,update,delete on public.pairing_pair_resolutions to authenticated;
create policy read_member on public.pairing_pair_resolutions for select to authenticated using(private.pairing_is_member(auth.uid()));
create policy insert_admin on public.pairing_pair_resolutions for insert to authenticated with check(private.pairing_is_admin(auth.uid()) and resolved_by=auth.uid());
create policy update_admin on public.pairing_pair_resolutions for update to authenticated using(private.pairing_is_admin(auth.uid())) with check(private.pairing_is_admin(auth.uid()) and resolved_by=auth.uid());
create policy delete_admin on public.pairing_pair_resolutions for delete to authenticated using(private.pairing_is_admin(auth.uid()));

create or replace view public.pairing_shared_scouts with(security_invoker=true) as
 with source as (select * from public.pairing_deck_scouts where private.pairing_is_contributor(user_id)),
 totals as (select tid,player_id,count(*)::int as contributor_count,count(distinct deck_name)>1 as conflict,array_agg(distinct deck_name order by deck_name) as alternatives from source group by tid,player_id)
 select distinct on(s.tid,s.player_id) s.user_id,s.tid,s.player_id,coalesce(r.deck_name,s.deck_name) as deck_name,s.observed_round,s.table_no,s.created_at,s.updated_at,t.contributor_count,(t.conflict and r.deck_name is null) as conflict,t.alternatives
 from source s join totals t using(tid,player_id) left join public.pairing_scout_resolutions r on r.tid=s.tid and r.player_id=s.player_id and r.deck_name=any(t.alternatives)
 order by s.tid,s.player_id,s.created_at,s.user_id;
create or replace view public.pairing_shared_pairs with(security_invoker=true) as
 with source as (select * from public.pairing_deck_pair_observations where private.pairing_is_contributor(user_id)),
 totals as (select tid,round_no,table_no,count(*)::int as contributor_count,count(distinct (least(player_a_id,player_b_id),greatest(player_a_id,player_b_id),least(deck_a,deck_b),greatest(deck_a,deck_b)))>1 as conflict from source group by tid,round_no,table_no)
 select distinct on(s.tid,s.round_no,s.table_no) s.user_id,s.tid,s.round_no,s.table_no,s.player_a_id,s.player_b_id,s.deck_a,s.deck_b,s.created_at,s.updated_at,t.contributor_count,(t.conflict and r.chosen_user_id is null) as conflict
 from source s join totals t using(tid,round_no,table_no)
 left join public.pairing_pair_resolutions r on r.tid=s.tid and r.round_no=s.round_no and r.table_no=s.table_no and r.chosen_user_id=s.user_id and r.deck_a=s.deck_a and r.deck_b=s.deck_b and r.player_a_id=s.player_a_id and r.player_b_id=s.player_b_id
 order by s.tid,s.round_no,s.table_no,(r.chosen_user_id is not null) desc,s.created_at,s.user_id;

-- A previously resolved conflict must be reconsidered if new evidence changes.
create function private.pairing_invalidate_resolution() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='pairing_deck_scouts' then
  if TG_OP='INSERT' or TG_OP='DELETE' or (TG_OP='UPDATE' and old.deck_name is distinct from new.deck_name) then
   delete from public.pairing_scout_resolutions where tid=coalesce(new.tid,old.tid) and player_id=coalesce(new.player_id,old.player_id);
  end if;
 else
  if TG_OP='INSERT' or TG_OP='DELETE' or (TG_OP='UPDATE' and (old.deck_a,old.deck_b,old.player_a_id,old.player_b_id) is distinct from (new.deck_a,new.deck_b,new.player_a_id,new.player_b_id)) then
   delete from public.pairing_pair_resolutions where tid=coalesce(new.tid,old.tid) and round_no=coalesce(new.round_no,old.round_no) and table_no=coalesce(new.table_no,old.table_no);
  end if;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function private.pairing_invalidate_resolution() from public,anon,authenticated;
create trigger invalidate_scout_resolution after insert or update or delete on public.pairing_deck_scouts for each row execute function private.pairing_invalidate_resolution();
create trigger invalidate_pair_resolution after insert or update or delete on public.pairing_deck_pair_observations for each row execute function private.pairing_invalidate_resolution();
alter publication supabase_realtime add table public.pairing_scout_resolutions,public.pairing_pair_resolutions;
