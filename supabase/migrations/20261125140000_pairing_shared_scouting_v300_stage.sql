-- v3.0.0: additive shared scouting and role separation.
-- Keep the pre-existing administrator allowlist intact. Guest activation is gated
-- until frontend/Edge regression and permission checks pass.
create table public.pairing_guest_grants (
 email text primary key check(email=lower(btrim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 display_name text not null check(length(btrim(display_name)) between 1 and 80),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.pairing_guest_grants enable row level security;
revoke all on public.pairing_guest_grants from anon,authenticated;
grant select,insert,update on public.pairing_guest_grants to authenticated;
create table private.pairing_guest_gate(id boolean primary key check(id), enabled boolean not null default false);
insert into private.pairing_guest_gate values(true,false);
create table private.pairing_shared_contributors(user_id uuid primary key, registered_at timestamptz not null default now());
create table private.pairing_guest_bindings(email text primary key, user_id uuid not null unique);
revoke all on private.pairing_guest_gate,private.pairing_shared_contributors,private.pairing_guest_bindings from public,anon,authenticated;

create function private.pairing_is_admin(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.player_identity_authorized_users a where a.user_id=target)
$$;
create function private.pairing_guest_email(target uuid) returns text language sql stable security definer set search_path='' as $$
 select lower(u.email) from auth.users u join public.pairing_guest_grants g on g.email=lower(u.email)
 where u.id=target and u.email_confirmed_at is not null and g.active
 and exists(select 1 from private.pairing_guest_gate where id and enabled)
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and lower(i.identity_data->>'email')=lower(u.email) and lower(coalesce(i.identity_data->>'email_verified','false'))='true')
 and not exists(select 1 from private.pairing_guest_bindings b where b.email=g.email and b.user_id<>u.id)
 and not exists(select 1 from private.pairing_guest_bindings b where b.user_id=u.id and b.email<>g.email)
 limit 1
$$;
create function private.pairing_is_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.pairing_is_admin(target) or private.pairing_guest_email(target) is not null
$$;
create function private.pairing_is_contributor(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.pairing_is_admin(target) or exists(select 1 from private.pairing_shared_contributors c where c.user_id=target)
$$;
revoke all on function private.pairing_is_admin(uuid),private.pairing_guest_email(uuid),private.pairing_is_member(uuid),private.pairing_is_contributor(uuid) from public,anon,authenticated;
grant execute on function private.pairing_is_admin(uuid),private.pairing_is_member(uuid),private.pairing_is_contributor(uuid) to authenticated,service_role;
-- Only service-role Edge Functions can check an arbitrary user's authorization.
create function public.is_pairing_member(target_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select private.pairing_is_member(target_user)
$$;
revoke all on function public.is_pairing_member(uuid) from public,anon,authenticated;
grant execute on function public.is_pairing_member(uuid) to service_role;
create function public.pairing_access_role() returns text language sql stable security invoker set search_path='' as $$
 select case when private.pairing_is_admin(auth.uid()) then 'admin' when private.pairing_is_member(auth.uid()) then 'guest' else 'none' end
$$;
revoke all on function public.pairing_access_role() from public,anon;
grant execute on function public.pairing_access_role() to authenticated;
create policy guest_grants_admin_select on public.pairing_guest_grants for select to authenticated using(private.pairing_is_admin(auth.uid()));
create policy guest_grants_admin_insert on public.pairing_guest_grants for insert to authenticated with check(private.pairing_is_admin(auth.uid()));
create policy guest_grants_admin_update on public.pairing_guest_grants for update to authenticated using(private.pairing_is_admin(auth.uid())) with check(private.pairing_is_admin(auth.uid()));

create or replace function private.can_view_player_identities() returns boolean language sql stable security definer set search_path='' as $$
 select private.pairing_is_member(auth.uid())
$$;
-- Persist a contributor ID on first authorized write, even when their grant
-- is subsequently disabled. Bind the grant to the verified Google user.
create function private.pairing_register_contributor() returns trigger language plpgsql security definer set search_path='' as $$
declare em text;
begin
 if private.pairing_is_admin(new.user_id) then return new; end if;
 em:=private.pairing_guest_email(new.user_id);
 if em is null then raise exception 'pairing access denied' using errcode='42501'; end if;
 insert into private.pairing_guest_bindings(email,user_id) values(em,new.user_id) on conflict do nothing;
 if not exists(select 1 from private.pairing_guest_bindings b where b.email=em and b.user_id=new.user_id) then raise exception 'grant is already bound' using errcode='42501'; end if;
 insert into private.pairing_shared_contributors(user_id) values(new.user_id) on conflict do nothing;
 return new;
end $$;
revoke all on function private.pairing_register_contributor() from public,anon,authenticated;
create trigger pairing_register_scout before insert or update on public.pairing_deck_scouts for each row execute function private.pairing_register_contributor();
create trigger pairing_register_pair before insert or update on public.pairing_deck_pair_observations for each row execute function private.pairing_register_contributor();

do $$
declare t text; pol record;
begin
 foreach t in array array['pairing_deck_scouts','pairing_deck_pair_observations'] loop
  for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',pol.policyname,t);
  end loop;
  execute format('create policy shared_select on public.%I for select to authenticated using(private.pairing_is_member(auth.uid()) and private.pairing_is_contributor(user_id))',t);
  execute format('create policy own_insert on public.%I for insert to authenticated with check(auth.uid()=user_id and private.pairing_is_member(auth.uid()))',t);
  execute format('create policy own_update on public.%I for update to authenticated using(auth.uid()=user_id and private.pairing_is_member(auth.uid())) with check(auth.uid()=user_id and private.pairing_is_member(auth.uid()))',t);
  execute format('create policy own_delete on public.%I for delete to authenticated using((auth.uid()=user_id and private.pairing_is_member(auth.uid())) or private.pairing_is_admin(auth.uid()))',t);
 end loop;
end $$;
create policy shared_catalog_read on public.pairing_deck_catalog for select to authenticated using(private.pairing_is_member(auth.uid()) and private.pairing_is_admin(user_id));

-- Keep first contribution visible, mark disagreement and retain all source rows.
create view public.pairing_shared_scouts with (security_invoker=true) as
 with source as (select * from public.pairing_deck_scouts where private.pairing_is_contributor(user_id)),
 totals as (select tid,player_id,count(*)::int as contributor_count,count(distinct deck_name)>1 as conflict,array_agg(distinct deck_name order by deck_name) as alternatives from source group by tid,player_id)
 select distinct on(s.tid,s.player_id) s.*,t.contributor_count,t.conflict,t.alternatives
 from source s join totals t using(tid,player_id)
 order by s.tid,s.player_id,s.created_at,s.user_id;
create view public.pairing_shared_pairs with (security_invoker=true) as
 with source as (select * from public.pairing_deck_pair_observations where private.pairing_is_contributor(user_id)),
 totals as (select tid,round_no,table_no,count(*)::int as contributor_count,count(distinct (least(player_a_id,player_b_id),greatest(player_a_id,player_b_id),least(deck_a,deck_b),greatest(deck_a,deck_b)))>1 as conflict from source group by tid,round_no,table_no)
 select distinct on(s.tid,s.round_no,s.table_no) s.*,t.contributor_count,t.conflict from source s join totals t using(tid,round_no,table_no)
 order by s.tid,s.round_no,s.table_no,s.created_at,s.user_id;
revoke all on public.pairing_shared_scouts,public.pairing_shared_pairs from public,anon,authenticated;
grant select on public.pairing_shared_scouts,public.pairing_shared_pairs to authenticated,service_role;

-- Disable guest-only tracking and device credentials immediately on revocation.
create function private.pairing_revoke_guest() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and (not new.active or old.email<>new.email) then
  update public.pairing_watches set active=false,updated_at=now() where user_id in (select u.id from auth.users u where lower(u.email)=old.email union select b.user_id from private.pairing_guest_bindings b where b.email=old.email) and not private.pairing_is_admin(user_id);
  update public.family_push_subscriptions set active=false,updated_at=now() where owner_user_id in (select u.id from auth.users u where lower(u.email)=old.email union select b.user_id from private.pairing_guest_bindings b where b.email=old.email) and not private.pairing_is_admin(owner_user_id);
  update public.family_push_invites set expires_at=least(expires_at,now()) where owner_user_id in (select u.id from auth.users u where lower(u.email)=old.email union select b.user_id from private.pairing_guest_bindings b where b.email=old.email) and not private.pairing_is_admin(owner_user_id);
  update public.push_subscriptions set notify_pairing=false where user_id in (select u.id from auth.users u where lower(u.email)=old.email union select b.user_id from private.pairing_guest_bindings b where b.email=old.email) and not private.pairing_is_admin(user_id);
 end if;
 return new;
end $$;
revoke all on function private.pairing_revoke_guest() from public,anon,authenticated;
create trigger pairing_guest_revocation after update on public.pairing_guest_grants for each row execute function private.pairing_revoke_guest();
alter publication supabase_realtime add table public.pairing_deck_scouts,public.pairing_deck_pair_observations;
