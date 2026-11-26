-- Expose only aggregate event metadata to authorized pairing members.
create function public.pairing_distribution_event(p_tid text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare event_title text; participants integer; final_count integer;
begin
 if auth.uid() is null or not private.pairing_is_member(auth.uid()) then raise exception 'pairing access denied' using errcode='42501'; end if;
 if p_tid is null or p_tid !~ '^[0-9]{1,12}$' then raise exception 'invalid event'; end if;
 select title into event_title from public.ptcg_match_archives where tid=p_tid;
 select count(distinct lower(m[1])) into participants from (
   select matches::text as payload from public.ptcg_match_archive_rounds where tid=p_tid
   union all select standings::text from public.ptcg_match_archive_finals where tid=p_tid
 ) r cross join lateral regexp_matches(r.payload,'tw[0-9]+','gi') m;
 select player_count into final_count from public.ptcg_match_archive_finals where tid=p_tid;
 return jsonb_build_object('title',event_title,'player_count',nullif(greatest(coalesce(participants,0),coalesce(final_count,0)),0));
end $$;
revoke all on function public.pairing_distribution_event(text) from public,anon,authenticated;
grant execute on function public.pairing_distribution_event(text) to authenticated;
