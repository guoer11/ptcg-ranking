alter table baseball_online.rooms add column mode text not null default 'strategy' check (mode in ('strategy','3d')), add column pitch_at timestamptz, add column flight_ms integer not null default 1500, add column last_timing text;
CREATE OR REPLACE FUNCTION baseball_online.api(op text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=auth.uid(); r baseball_online.rooms%rowtype; sv baseball_online.saves%rowtype;
 c text:=upper(trim(coalesce(args->>'code',''))); nick text; pitch text; zone int; guess int; swing text;
 batter uuid; pitcher uuid; outcome text; hit int:=0; run_count int:=0; p float8; prob float8;
 timing_error float8; timing_grade text; prev_rev int; old_bases int; i int; dest int; advance_out boolean:=false; finish_game boolean:=false; answer jsonb;
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
  insert into baseball_online.rooms(host,host_name,mode) values(u,nick,case when args->>'mode'='3d' then '3d' else 'strategy' end) returning * into r;
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
    r.secret_pitch:=pitch;r.secret_zone:=zone;r.phase:='swing';r.pitch_at:=null;r.flight_ms:=case pitch when 'FF' then 1500 when 'SL' then 1660 when 'CH' then 1900 else 1810 end;r.last_timing:=null;r.last_result:='投手已出手，等待打者';
   elsif op='arm' then
    if r.mode<>'3d' or u<>batter or r.phase<>'swing' or r.pitch_at is not null then raise exception '尚未輪到你準備打擊'; end if;
    r.pitch_at:=clock_timestamp()+interval '2.6 seconds';r.last_result:='即將投球';
   elsif op='swing' then
    if u<>batter or r.phase<>'swing' then raise exception '尚未輪到你打擊'; end if;
    swing:=args->>'swing';guess:=(args->>'zone')::int;pitch:=args->>'pitch';
    if swing is null or swing not in ('contact','power','take') or guess is null or guess not between 1 and 9 or pitch is null or pitch not in ('FF','SL','CH','CU') then raise exception '打擊指令不正確'; end if;
    if r.mode='3d' then
      if r.pitch_at is null or clock_timestamp()<r.pitch_at then raise exception '球尚未出手'; end if;
      timing_error:=abs(extract(epoch from (clock_timestamp()-r.pitch_at))*1000-r.flight_ms*.90-90);
      if swing='take' then
        if clock_timestamp()<r.pitch_at+make_interval(secs=>r.flight_ms*.001*.90) then raise exception '來球尚未抵達'; end if;
        timing_grade:='選球';
      elsif timing_error<=170 then timing_grade:='PERFECT';
      elsif timing_error<=340 then timing_grade:='GOOD';
      else timing_grade:='MISS';end if;
      r.last_timing:=timing_grade;
    end if;
    r.last_pitch:=r.secret_pitch;r.last_zone:=r.secret_zone;
    p:=random();
    if swing='take' then
      if r.secret_zone=0 then r.balls:=r.balls+1;outcome:='壞球';
      else r.strikes:=r.strikes+1;outcome:='好球'; end if;
    elsif r.secret_zone=0 or (r.mode='3d' and timing_grade='MISS') then
      r.strikes:=r.strikes+1;outcome:='揮空';
    else
      prob:=case when swing='power' then .20 else .34 end;
      if r.mode='3d' then
        prob:=prob+case when timing_grade='PERFECT' then .32 else .11 end;
      elsif pitch=r.secret_pitch then prob:=prob+.23; end if;
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
    r.phase:='pitch';r.secret_pitch:=null;r.secret_zone:=null;r.pitch_at:=null;
    if finish_game then r.status:='finished';r.winner:=case when r.home_score>r.away_score then r.host when r.away_score>r.home_score then r.guest else null end; end if;
   else raise exception '不支援的操作';end if;
  end if;
  if op<>'get' then
    r.rev:=r.rev+1;r.updated_at:=now();
    update baseball_online.rooms set status=r.status,rev=r.rev,inning=r.inning,half=r.half,outs=r.outs,balls=r.balls,strikes=r.strikes,bases=r.bases,home_score=r.home_score,away_score=r.away_score,phase=r.phase,secret_pitch=r.secret_pitch,secret_zone=r.secret_zone,last_result=r.last_result,last_pitch=r.last_pitch,last_zone=r.last_zone,winner=r.winner,updated_at=r.updated_at,pitch_at=r.pitch_at,flight_ms=r.flight_ms,last_timing=r.last_timing where code=r.code;
    if finish_game then
      insert into baseball_online.ranking(uid,nickname,games,wins,losses,ties)
      values(r.host,r.host_name,1,case when r.winner=r.host then 1 else 0 end,case when r.winner=r.guest then 1 else 0 end,case when r.winner is null then 1 else 0 end),
            (r.guest,r.guest_name,1,case when r.winner=r.guest then 1 else 0 end,case when r.winner=r.host then 1 else 0 end,case when r.winner is null then 1 else 0 end)
      on conflict(uid) do update set nickname=excluded.nickname,games=baseball_online.ranking.games+1,wins=baseball_online.ranking.wins+excluded.wins,losses=baseball_online.ranking.losses+excluded.losses,ties=baseball_online.ranking.ties+excluded.ties;
    end if;
  end if;
 end if;
 return (to_jsonb(r)-'host'-'guest'-'winner'-'secret_pitch'-'secret_zone')||jsonb_build_object('me',case when r.host=u then 'home' else 'away' end,'winner_side',case when r.winner=r.host then 'home' when r.winner=r.guest then 'away' else null end,'server_now',clock_timestamp(),'live_pitch',case when r.mode='3d' and r.status='playing' and r.pitch_at is not null then r.secret_pitch else null end,'live_zone',case when r.mode='3d' and r.status='playing' and r.pitch_at is not null then r.secret_zone else null end);
end $function$
;
