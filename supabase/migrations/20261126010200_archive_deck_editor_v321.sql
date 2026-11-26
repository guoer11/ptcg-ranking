-- Administrator-only correction of a single archived player's event deck.
create function public.edit_archived_player_deck(p_tid text,p_player_id text,p_action text,p_deck text default null,p_revision text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); pid text:=lower(btrim(p_player_id)); name text:=btrim(p_deck);
  revision text; current_row record; catalog jsonb; pair_count integer; event_date timestamptz;
  original_round integer; original_table text; original_date timestamptz; removed integer:=0;
begin
 if uid is null or not private.pairing_is_admin(uid) then raise exception '僅管理者可修改封存牌組' using errcode='42501';end if;
 if p_tid is null or p_tid !~ '^[0-9]{1,12}$' or pid is null or pid !~ '^tw[0-9]+$' or p_action not in ('read','save','clear') then raise exception '賽事或玩家資料無效';end if;
 select first_seen_at into event_date from public.ptcg_match_archives where tid=p_tid;
 if not found or not (
 exists(select 1 from public.ptcg_match_archive_finals f cross join lateral jsonb_array_elements(f.standings) s where f.tid=p_tid and lower(s->>'id')=pid)
 or exists(select 1 from public.ptcg_match_archive_interims f cross join lateral jsonb_array_elements(f.standings) s where f.tid=p_tid and lower(s->>'id')=pid)
 ) then raise exception '玩家不在該場封存排名內';end if;
 if p_action<>'read' then
  lock table public.pairing_deck_catalog,public.pairing_deck_scouts,public.pairing_deck_pair_observations,public.pairing_scout_resolutions,public.pairing_pair_resolutions in share row exclusive mode;
 end if;
 select md5(jsonb_build_array(
 (select coalesce(jsonb_agg(to_jsonb(s) order by s.user_id),'[]'::jsonb) from public.pairing_deck_scouts s where s.tid=p_tid and s.player_id=pid and private.pairing_is_contributor(s.user_id)),
 (select coalesce(jsonb_agg(to_jsonb(s) order by s.user_id,s.round_no,s.table_no),'[]'::jsonb) from public.pairing_deck_pair_observations s where s.tid=p_tid and pid in(s.player_a_id,s.player_b_id) and private.pairing_is_contributor(s.user_id)),
 (select to_jsonb(s) from public.pairing_scout_resolutions s where s.tid=p_tid and s.player_id=pid),
 (select coalesce(jsonb_agg(to_jsonb(s) order by s.round_no,s.table_no),'[]'::jsonb) from public.pairing_pair_resolutions s where s.tid=p_tid and pid in(s.player_a_id,s.player_b_id))
 )::text) into revision;
 select * into current_row from public.pairing_shared_scouts where tid=p_tid and player_id=pid;
 select count(*) into pair_count from public.pairing_shared_pairs where tid=p_tid and pid in(player_a_id,player_b_id);
 if p_action='read' then
  select coalesce(jsonb_agg(c.name order by c.sort_order,c.id),'[]'::jsonb) into catalog from public.pairing_deck_catalog c where c.user_id=uid;
  return jsonb_build_object('revision',revision,'catalog',catalog,'deck',current_row.deck_name,'conflict',coalesce(current_row.conflict,false),'alternatives',current_row.alternatives,'pair_count',pair_count);
 end if;
 if p_revision is distinct from revision then raise exception '牌組紀錄已變更，請關閉後重新編輯';end if;
 if p_action='save' then
  if name is null or char_length(name) not between 1 and 40 or not exists(select 1 from public.pairing_deck_catalog c where c.user_id=uid and c.name=name) then raise exception '請選擇現有牌組清單的名稱';end if;
  if current_row.deck_name=name and not coalesce(current_row.conflict,false) then return jsonb_build_object('saved',true,'deck',name);end if;
  original_round:=current_row.observed_round;original_table:=current_row.table_no;
  original_date:=coalesce(current_row.created_at,event_date,now());
  insert into public.pairing_deck_scouts(user_id,tid,player_id,deck_name,observed_round,table_no,created_at,updated_at)
  values(uid,p_tid,pid,name,original_round,original_table,original_date,now())
  on conflict(user_id,tid,player_id) do update set deck_name=excluded.deck_name,updated_at=now();
  -- Retain other contributors' original observations; the administrator's
  -- correction explicitly adjudicates any competing current label.
  if exists(select 1 from public.pairing_shared_scouts where tid=p_tid and player_id=pid and conflict) then
   insert into public.pairing_scout_resolutions(tid,player_id,deck_name,resolved_by,resolved_at)
   values(p_tid,pid,name,uid,now()) on conflict(tid,player_id) do update set deck_name=excluded.deck_name,resolved_by=uid,resolved_at=now();
  elsif current_row.deck_name is distinct from name then
   delete from public.pairing_scout_resolutions where tid=p_tid and player_id=pid;
   if exists(select 1 from public.pairing_shared_scouts where tid=p_tid and player_id=pid and conflict) then
    insert into public.pairing_scout_resolutions(tid,player_id,deck_name,resolved_by) values(p_tid,pid,name,uid);
   end if;
  end if;
 else
  -- Clear related ambiguous table observations too, or the distribution
  -- could immediately infer the deleted label again. Independently confirmed
  -- records for other players are not touched. Existing audit triggers retain originals.
  delete from public.pairing_deck_pair_observations s where s.tid=p_tid and pid in(s.player_a_id,s.player_b_id) and private.pairing_is_contributor(s.user_id);
  get diagnostics removed=row_count;
  delete from public.pairing_deck_scouts s where s.tid=p_tid and s.player_id=pid and private.pairing_is_contributor(s.user_id);
  delete from public.pairing_scout_resolutions s where s.tid=p_tid and s.player_id=pid;
 end if;
 insert into private.pairing_scout_audit(table_name,op,actor,old_row,new_row) values('archive_deck','ARCHIVE_'||upper(p_action),uid,jsonb_build_object('tid',p_tid,'player_id',pid,'revision',revision,'deck',current_row.deck_name),jsonb_build_object('deck',case when p_action='save' then name end,'removed_pair_rows',removed));
 return jsonb_build_object('saved',true,'deck',case when p_action='save' then name end,'removed_pair_rows',removed);
end $$;
revoke all on function public.edit_archived_player_deck(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.edit_archived_player_deck(text,text,text,text,text) to authenticated;
