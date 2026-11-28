
create schema if not exists baseball_online;
revoke all on schema baseball_online from public, anon, authenticated;
create table baseball_online.rooms (
 code text primary key default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 host uuid not null, guest uuid, host_name text not null, guest_name text,
 status text not null default 'waiting' check(status in ('waiting','playing','finished','cancelled')),
 rev integer not null default 0, inning integer not null default 1, half integer not null default 0,
 outs integer not null default 0, balls integer not null default 0, strikes integer not null default 0,
 bases integer not null default 0, home_score integer not null default 0, away_score integer not null default 0,
 phase text not null default 'pitch', secret_pitch text, secret_zone integer,
 last_result text not null default '等待好友', last_pitch text, last_zone integer, winner uuid,
 updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index baseball_online_host_idx on baseball_online.rooms(host,updated_at desc);
create index baseball_online_guest_idx on baseball_online.rooms(guest,updated_at desc);
create table baseball_online.ranking (
 uid uuid primary key, nickname text not null, games int not null default 0, wins int not null default 0,
 losses int not null default 0, ties int not null default 0
);
create table baseball_online.saves (
 uid uuid primary key, revision integer not null default 1, payload jsonb not null, updated_at timestamptz not null default now()
);
alter table baseball_online.rooms enable row level security;
alter table baseball_online.ranking enable row level security;
alter table baseball_online.saves enable row level security;
revoke all on all tables in schema baseball_online from public,anon,authenticated;
create function baseball_online.api(op text, args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 u uuid:=auth.uid(); r baseball_online.rooms%rowtype; sv baseball_online.saves%rowtype;
 c text:=upper(trim(coalesce(args->>'code',''))); nick text; pitch text; zone int; guess int; swing text;
 batter uuid; pitcher uuid; outcome text; hit int:=0; run_count int:=0; p float8; prob float8;
 prev_rev int; old_bases int; i int; dest int; advance_out boolean:=false; finish_game boolean:=false; answer jsonb;
begin
 if u is null then raise exception '需要登入'; end if;
 if op='rank' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into answer from
   (select nickname,games,wins,losses,ties from baseball_online.ranking where games>0 order by wins desc, wins::numeric/games desc, games desc limit 50) x;
  return answer;
 elsif op='save_get' then
  select * into sv from baseball_online.saves where uid=u;
  if not found then return jsonb_build_object('revision',0); end if;
  return jsonb_build_object('revision',sv.revision,'payload',sv.payload,'updated_at',sv.updated_at);
 elsif op='save_put' then
  if jsonb_typeof(args->'payload') is distinct from 'object' or octet_length((args->'payload')::text)>262144 then raise exception '備份格式或大小不符'; end if;
  prev_rev:=(args->>'revision')::int;
  perform pg_advisory_xact_lock(hashtextextended(u::text||':baseball-save',0));
  select * into sv from baseball_online.saves where uid=u for update;
  if coalesce(sv.revision,0) is distinct from prev_rev then raise exception '備份版本已變更，請重新讀取'; end if;
  insert into baseball_online.saves(uid,payload,revision) values(u,args->'payload',prev_rev+1)
  on conflict(uid) do update set payload=excluded.payload,revision=excluded.revision,updated_at=now();
  return jsonb_build_object('revision',prev_rev+1);
 elsif op='resume' then
  select * into r from baseball_online.rooms where (host=u or guest=u) and status in ('waiting','playing') and updated_at>now()-interval '24 hours' order by updated_at desc limit 1;
  if not found then return null; end if;
 elsif op='create' then
  nick:=left(trim(coalesce(args->>'name','')),20);
  if nick='' then raise exception '請輸入暱稱'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||':baseball-room',0));
  if exists(select 1 from baseball_online.rooms where (host=u or guest=u) and status in ('waiting','playing') and updated_at>now()-interval '24 hours') then raise exception '已有進行中的房間，請繼續或離開'; end if;
  if (select count(*) from baseball_online.rooms where host=u and created_at>now()-interval '1 hour')>=12 then raise exception '建立房間過於頻繁'; end if;
  insert into baseball_online.rooms(host,host_name) values(u,nick) returning * into r;
 elsif op='join' then
  nick:=left(trim(coalesce(args->>'name','')),20);
  if nick='' then raise exception '請輸入暱稱'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||':baseball-room',0));
  select * into r from baseball_online.rooms where code=c and updated_at>now()-interval '24 hours' for update;
  if not found or r.host=u or r.status<>'waiting' or r.guest is not null then raise exception '房間不存在、已滿或不能加入自己'; end if;
  if exists(select 1 from baseball_online.rooms where (host=u or guest=u) and status in ('waiting','playing') and updated_at>now()-interval '24 hours') then raise exception '已有進行中的房間'; end if;
  update baseball_online.rooms set guest=u,guest_name=nick,status='playing',rev=rev+1,last_result='開賽！客隊進攻',updated_at=now() where code=c returning * into r;
 else
  select * into r from baseball_online.rooms where code=c and (host=u or guest=u) and updated_at>now()-interval '24 hours' for update;
  if not found then raise exception '房間不存在或無權存取'; end if;
  if op='get' then null;
  elsif op='forfeit' then
   if r.rev is distinct from (args->>'rev')::int or r.status not in ('waiting','playing') then raise exception '房間狀態已變更'; end if;
   -- Waiting rooms can be cancelled; active games count as a forfeit.
   if r.status='waiting' then r.status:='cancelled';
   else r.status:='finished';r.winner:=case when r.host=u then r.guest else r.host end;finish_game:=true; end if;
   r.last_result:='玩家離開比賽';
  else
   if r.status<>'playing' or r.rev is distinct from (args->>'rev')::int then raise exception '房間狀態已變更'; end if;
   batter:=case when r.half=0 then r.guest else r.host end;
   pitcher:=case when r.half=0 then r.host else r.guest end;
   if op='pitch' then
    pitch:=args->>'pitch';zone:=(args->>'zone')::int;
    if u<>pitcher or r.phase<>'pitch' then raise exception '尚未輪到你投球'; end if;
    if pitch is null or pitch not in ('FF','SL','CH','CU') or zone is null or zone not between 0 and 9 then raise exception '球種或位置不正確'; end if;
    r.secret_pitch:=pitch;r.secret_zone:=zone;r.phase:='swing';r.last_result:='投手已出手，等待打者';
   elsif op='swing' then
    if u<>batter or r.phase<>'swing' then raise exception '尚未輪到你打擊'; end if;
    swing:=args->>'swing';guess:=(args->>'zone')::int;pitch:=args->>'pitch';
    if swing is null or swing not in ('contact','power','take') or guess is null or guess not between 1 and 9 or pitch is null or pitch not in ('FF','SL','CH','CU') then raise exception '打擊指令不正確'; end if;
    r.last_pitch:=r.secret_pitch;r.last_zone:=r.secret_zone;
    p:=random();
    if swing='take' then
      if r.secret_zone=0 then r.balls:=r.balls+1;outcome:='壞球';
      else r.strikes:=r.strikes+1;outcome:='好球'; end if;
    elsif r.secret_zone=0 then
      r.strikes:=r.strikes+1;outcome:='揮空';
    else
      prob:=case when swing='power' then .20 else .34 end;
      if pitch=r.secret_pitch then prob:=prob+.23; end if;
      if guess=r.secret_zone then prob:=prob+.24;
      elsif abs((guess-1)/3-(r.secret_zone-1)/3)+abs((guess-1)%3-(r.secret_zone-1)%3)=1 then prob:=prob+.10; end if;
      if p<prob then
        p:=random();hit:=case when p<(case when swing='power' then .28 else .08 end) then 4 when p<.38 then 2 when p<.41 then 3 else 1 end;
        outcome:=case hit when 4 then '全壘打！' when 3 then '三壘安打' when 2 then '二壘安打' else '一壘安打' end;
      elsif p<prob+.18 then r.strikes:=r.strikes+1;outcome:='揮空';
      elsif p<prob+.28 then r.strikes:=least(2,r.strikes+1);outcome:='界外球';
      else advance_out:=true;outcome:='打者出局'; end if;
    end if;
    if r.strikes>=3 then advance_out:=true;outcome:='三振出局'; end if;
    if advance_out then r.outs:=r.outs+1;r.balls:=0;r.strikes:=0;
    elsif r.balls>=4 then
      outcome:='四壞保送';
      if (r.bases&1)=0 then r.bases:=r.bases|1;
      elsif (r.bases&2)=0 then r.bases:=r.bases|2;
      elsif (r.bases&4)=0 then r.bases:=r.bases|4;
      else run_count:=1;end if;
      r.balls:=0;r.strikes:=0;
    elsif hit>0 then
      old_bases:=r.bases;r.bases:=0;
      for i in 1..3 loop
        if (old_bases&(1<<(i-1)))<>0 then dest:=i+hit;
          if dest>=4 then run_count:=run_count+1;else r.bases:=r.bases|(1<<(dest-1));end if;
        end if;
      end loop;
      if hit=4 then run_count:=run_count+1;else r.bases:=r.bases|(1<<(hit-1));end if;
      r.balls:=0;r.strikes:=0;
    end if;
    if r.half=0 then r.away_score:=r.away_score+run_count;else r.home_score:=r.home_score+run_count;end if;
    r.last_result:=outcome||case when run_count>0 then '・'||run_count||' 分' else '' end;
    if r.inning=3 and r.half=1 and r.home_score>r.away_score then finish_game:=true;
    elsif r.outs>=3 then
      if r.inning=3 and (r.half=1 or r.home_score>r.away_score) then finish_game:=true;
      else r.half:=1-r.half;if r.half=0 then r.inning:=r.inning+1;end if;r.outs:=0;r.bases:=0;r.balls:=0;r.strikes:=0;end if;
    end if;
    r.phase:='pitch';r.secret_pitch:=null;r.secret_zone:=null;
    if finish_game then r.status:='finished';r.winner:=case when r.home_score>r.away_score then r.host when r.away_score>r.home_score then r.guest else null end; end if;
   else raise exception '不支援的操作';end if;
  end if;
  if op<>'get' then
    r.rev:=r.rev+1;r.updated_at:=now();
    update baseball_online.rooms set status=r.status,rev=r.rev,inning=r.inning,half=r.half,outs=r.outs,balls=r.balls,strikes=r.strikes,bases=r.bases,home_score=r.home_score,away_score=r.away_score,phase=r.phase,secret_pitch=r.secret_pitch,secret_zone=r.secret_zone,last_result=r.last_result,last_pitch=r.last_pitch,last_zone=r.last_zone,winner=r.winner,updated_at=r.updated_at where code=r.code;
    if finish_game then
      insert into baseball_online.ranking(uid,nickname,games,wins,losses,ties)
      values(r.host,r.host_name,1,case when r.winner=r.host then 1 else 0 end,case when r.winner=r.guest then 1 else 0 end,case when r.winner is null then 1 else 0 end),
            (r.guest,r.guest_name,1,case when r.winner=r.guest then 1 else 0 end,case when r.winner=r.host then 1 else 0 end,case when r.winner is null then 1 else 0 end)
      on conflict(uid) do update set nickname=excluded.nickname,games=baseball_online.ranking.games+1,wins=baseball_online.ranking.wins+excluded.wins,losses=baseball_online.ranking.losses+excluded.losses,ties=baseball_online.ranking.ties+excluded.ties;
    end if;
  end if;
 end if;
 return (to_jsonb(r)-'host'-'guest'-'winner'-'secret_pitch'-'secret_zone')||jsonb_build_object('me',case when r.host=u then 'home' else 'away' end,'winner_side',case when r.winner=r.host then 'home' when r.winner=r.guest then 'away' else null end);
end $$;
revoke all on function baseball_online.api(text,jsonb) from public,anon,authenticated;
grant usage on schema baseball_online to authenticated;
grant execute on function baseball_online.api(text,jsonb) to authenticated;
create function public.baseball_online_v500(op text,args jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select baseball_online.api(op,args)$$;
revoke all on function public.baseball_online_v500(text,jsonb) from public,anon,authenticated;
grant execute on function public.baseball_online_v500(text,jsonb) to authenticated;
