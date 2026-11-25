-- Rename a shared deck label without deleting its catalog item or observations.
create or replace function private.pairing_register_contributor() returns trigger language plpgsql security definer set search_path='' as $$
declare em text;
begin
 if private.pairing_is_admin(new.user_id) then return new; end if;
 -- An administrator may correct labels on retained contributions, even from a revoked guest.
 -- Direct writes are still restricted by the existing table RLS policies.
 if TG_OP='UPDATE' and old.user_id=new.user_id and private.pairing_is_admin(auth.uid())
    and exists(select 1 from private.pairing_shared_contributors c where c.user_id=new.user_id) then return new; end if;
 em:=private.pairing_guest_email(new.user_id);
 if em is null then raise exception 'pairing access denied' using errcode='42501'; end if;
 insert into private.pairing_guest_bindings(email,user_id) values(em,new.user_id) on conflict do nothing;
 if not exists(select 1 from private.pairing_guest_bindings b where b.email=em and b.user_id=new.user_id) then raise exception 'grant is already bound' using errcode='42501'; end if;
 insert into private.pairing_shared_contributors(user_id) values(new.user_id) on conflict do nothing;
 return new;
end $$;
create function public.rename_pairing_deck(p_id bigint,p_expected_name text,p_new_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); old_name text; new_name text:=btrim(p_new_name); ns integer; np integer; sr jsonb; pr jsonb;
begin
 if uid is null or not private.pairing_is_admin(uid) then raise exception '僅管理者可修改共用牌組名稱' using errcode='42501'; end if;
 if new_name is null or char_length(new_name) not between 1 and 40 then raise exception '請輸入 1 至 40 字的牌組名稱'; end if;
 -- Serialize the short rename with scouting writes and conflict decisions.
 lock table public.pairing_deck_catalog,public.pairing_deck_scouts,public.pairing_deck_pair_observations,public.pairing_scout_resolutions,public.pairing_pair_resolutions in share row exclusive mode;
 select name into old_name from public.pairing_deck_catalog where id=p_id and user_id=uid;
 if not found or old_name is distinct from p_expected_name then raise exception '牌組清單已變更，請重新讀取'; end if;
 if new_name=old_name then return jsonb_build_object('name',new_name,'scouts',0,'pairs',0); end if;
 if exists(select 1 from public.pairing_deck_catalog where id<>p_id and private.pairing_is_admin(user_id) and lower(name)=lower(new_name))
 or exists(select 1 from public.pairing_deck_scouts where private.pairing_is_contributor(user_id) and deck_name<>old_name and lower(deck_name)=lower(new_name))
 or exists(select 1 from public.pairing_deck_pair_observations where private.pairing_is_contributor(user_id) and ((deck_a<>old_name and lower(deck_a)=lower(new_name)) or (deck_b<>old_name and lower(deck_b)=lower(new_name))))
 then raise exception '新名稱已存在於清單或歷史紀錄，不能直接合併'; end if;
 -- Existing resolution invalidation triggers run on rename. Restore exactly the
 -- affected decisions with the corrected label, keeping the decision maker/time.
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into sr from public.pairing_scout_resolutions r
 where exists(select 1 from public.pairing_deck_scouts s where s.tid=r.tid and s.player_id=r.player_id and s.deck_name=old_name and private.pairing_is_contributor(s.user_id));
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into pr from public.pairing_pair_resolutions r
 where exists(select 1 from public.pairing_deck_pair_observations s where s.tid=r.tid and s.round_no=r.round_no and s.table_no=r.table_no and old_name in(s.deck_a,s.deck_b) and private.pairing_is_contributor(s.user_id));
 update public.pairing_deck_catalog set name=new_name where id=p_id and user_id=uid;
 update public.pairing_deck_scouts set deck_name=new_name where deck_name=old_name and private.pairing_is_contributor(user_id);
 get diagnostics ns=row_count;
 update public.pairing_deck_pair_observations set deck_a=case when deck_a=old_name then new_name else deck_a end,deck_b=case when deck_b=old_name then new_name else deck_b end where old_name in(deck_a,deck_b) and private.pairing_is_contributor(user_id);
 get diagnostics np=row_count;
 insert into public.pairing_scout_resolutions(tid,player_id,deck_name,resolved_by,resolved_at)
 select r.tid,r.player_id,case when r.deck_name=old_name then new_name else r.deck_name end,r.resolved_by,r.resolved_at
 from jsonb_populate_recordset(null::public.pairing_scout_resolutions,sr) r
 on conflict(tid,player_id) do nothing;
 insert into public.pairing_pair_resolutions(tid,round_no,table_no,chosen_user_id,deck_a,deck_b,player_a_id,player_b_id,resolved_by,resolved_at)
 select r.tid,r.round_no,r.table_no,r.chosen_user_id,case when r.deck_a=old_name then new_name else r.deck_a end,case when r.deck_b=old_name then new_name else r.deck_b end,r.player_a_id,r.player_b_id,r.resolved_by,r.resolved_at
 from jsonb_populate_recordset(null::public.pairing_pair_resolutions,pr) r
 on conflict(tid,round_no,table_no) do nothing;
 insert into private.pairing_scout_audit(table_name,op,actor,old_row,new_row) values('pairing_deck_catalog','RENAME',uid,jsonb_build_object('id',p_id,'name',old_name),jsonb_build_object('id',p_id,'name',new_name,'scouts',ns,'pairs',np));
 return jsonb_build_object('name',new_name,'scouts',ns,'pairs',np);
end $$;
revoke all on function public.rename_pairing_deck(bigint,text,text) from public,anon,authenticated;
grant execute on function public.rename_pairing_deck(bigint,text,text) to authenticated;
alter publication supabase_realtime add table public.pairing_deck_catalog;
