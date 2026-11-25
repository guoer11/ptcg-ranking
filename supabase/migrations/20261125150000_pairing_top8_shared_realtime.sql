create table public.pairing_top8_changes(tid text primary key,updated_at timestamptz not null default now());
alter table public.pairing_top8_changes enable row level security;
revoke all on public.pairing_top8_changes from public,anon,authenticated;
grant select on public.pairing_top8_changes to authenticated;
create policy top8_change_member on public.pairing_top8_changes for select to authenticated using(private.pairing_is_member(auth.uid()));
create function private.signal_pairing_top8() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.pairing_top8_changes(tid,updated_at) values(new.tid,clock_timestamp()) on conflict(tid) do update set updated_at=excluded.updated_at;
 return new;
end $$;
revoke all on function private.signal_pairing_top8() from public,anon,authenticated;
create trigger signal_pairing_top8 after insert or update on public.ptcg_match_archive_knockouts for each row execute function private.signal_pairing_top8();
alter publication supabase_realtime add table public.pairing_top8_changes;
