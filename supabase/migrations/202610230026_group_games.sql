-- Group games: a weekly game (race, team goal or streak duel) scored from the check-offs members
-- already make, cheers that score, last game's podium and badges, reusable invite links, and
-- a push job for cheers. Scores only ever include members who share their progress summary.

create table public.group_challenges(
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id) on delete cascade,
 kind text not null check(kind in ('race','team','streak')),
 starts_on date not null, ends_on date not null,
 team_target integer check(team_target between 1 and 100000),
 created_by uuid references public.profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),
 check(ends_on>=starts_on and ends_on-starts_on<=13),
 check((kind='team')=(team_target is not null)));
create index group_challenges_group_dates on public.group_challenges(group_id,starts_on);
alter table public.group_challenges enable row level security;
create policy group_challenges_read on public.group_challenges for select to authenticated using(app.member_of_group(group_id,auth.uid()));
grant select on public.group_challenges to authenticated;

-- Reusable invite links (7 days, many joins) next to the existing single-use codes.
alter table public.invitations add column reusable boolean not null default false;

-- Cheer push delivery state. Cheers sent before this migration are never pushed.
alter table public.garden_cheers add column push_state text not null default 'pending' check(push_state in ('pending','leased','sent','skipped','failed'));
alter table public.garden_cheers add column push_attempts integer not null default 0;
alter table public.garden_cheers add column push_lease_until timestamptz;
update public.garden_cheers set push_state='skipped';
create index garden_cheers_push on public.garden_cheers(push_state,created_at) where push_state in ('pending','failed');

create function app.cheer_day(p_at timestamptz) returns date language sql immutable as $$ select (p_at at time zone 'America/New_York')::date $$;

-- One member's scheduled and completed habits on one day.
create function app.day_tally(p_user uuid,p_day date,out due integer,out done integer) language sql stable security definer set search_path=public as $$
 select count(*)::int,count(*) filter(where coalesce(c.completed,false))::int
 from public.tasks t left join public.completions c on c.task_id=t.id and c.local_date=p_day
 where t.owner_id=p_user and app.due(t.id,p_day)
$$;

-- Points: +1 per check-off, +2 for finishing every scheduled habit that day,
-- +1 on a day you cheered someone in this group, +1 on a day someone cheered you.
create function app.group_points(p_group uuid,p_user uuid,p_from date,p_to date) returns integer language sql stable security definer set search_path=public as $$
 select coalesce(sum(x.done+case when x.due>0 and x.done=x.due then 2 else 0 end
  +case when exists(select 1 from public.garden_cheers g where g.group_id=p_group and g.from_user=p_user and app.cheer_day(g.created_at)=d.day::date) then 1 else 0 end
  +case when exists(select 1 from public.garden_cheers g where g.group_id=p_group and g.to_user=p_user and app.cheer_day(g.created_at)=d.day::date) then 1 else 0 end),0)::int
 from generate_series(p_from,least(p_to,app.local_day()),'1 day'::interval) d(day) cross join lateral app.day_tally(p_user,d.day::date) x
$$;

-- Streak duel: the first finished day with a missed habit (today never counts as missed yet).
create function app.streak_out_on(p_user uuid,p_from date,p_to date) returns date language sql stable security definer set search_path=public as $$
 select min(d.day)::date from generate_series(p_from,least(p_to,app.local_day()-1),'1 day'::interval) d(day)
 cross join lateral app.day_tally(p_user,d.day::date) x where x.due>0 and x.done<x.due
$$;

create function app.group_checkoffs(p_user uuid,p_from date,p_to date) returns integer language sql stable security definer set search_path=public as $$
 select coalesce(sum(x.done),0)::int from generate_series(p_from,least(p_to,app.local_day()),'1 day'::interval) d(day) cross join lateral app.day_tally(p_user,d.day::date) x
$$;

-- The game covering p_day: a started challenge, else this week's default race (Monday to
-- Sunday, starting after any challenge that ended earlier in the week).
create function app.group_period(p_group uuid,p_day date,out kind text,out starts_on date,out ends_on date,out team_target integer,out challenge_id uuid) language plpgsql stable security definer set search_path=public as $$
declare v public.group_challenges%rowtype;v_monday date:=p_day-(extract(isodow from p_day)::int-1);v_prev date;
begin
 select * into v from public.group_challenges c where c.group_id=p_group and c.starts_on<=p_day and c.ends_on>=p_day order by c.starts_on desc limit 1;
 if v.id is not null then kind:=v.kind;starts_on:=v.starts_on;ends_on:=v.ends_on;team_target:=v.team_target;challenge_id:=v.id;return;end if;
 select max(c.ends_on) into v_prev from public.group_challenges c where c.group_id=p_group and c.ends_on<p_day and c.ends_on>=v_monday;
 kind:='race';starts_on:=greatest(v_monday,coalesce(v_prev+1,v_monday));
 select least(v_monday+6,coalesce(min(c.starts_on)-1,v_monday+6)) into ends_on from public.group_challenges c where c.group_id=p_group and c.starts_on>p_day;
 team_target:=null;challenge_id:=null;
end $$;

-- Standings for one period: every member, with points only for those sharing a summary.
create function app.group_standings(p_group uuid,p_kind text,p_from date,p_to date) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(r order by (r->>'visible')::boolean desc,(r->>'alive')::boolean desc,coalesce(r->>'out_on','9999-12-31') desc,(r->>'points')::int desc,r->>'name'),'[]'::jsonb) from (
  select jsonb_build_object('user_id',m.user_id,'name',p.display_name,'visible',s.show_summary or m.user_id=auth.uid(),
   'character',coalesce(e.character_style,'{"color":"cream","hat":"none","outfit":"none"}'::jsonb),
   'points',case when s.show_summary or m.user_id=auth.uid() then app.group_points(p_group,m.user_id,p_from,p_to) else 0 end,
   'checkoffs',case when s.show_summary or m.user_id=auth.uid() then app.group_checkoffs(m.user_id,p_from,p_to) else 0 end,
   'out_on',case when p_kind='streak' and (s.show_summary or m.user_id=auth.uid()) then app.streak_out_on(m.user_id,p_from,p_to) end,
   'alive',p_kind<>'streak' or ((s.show_summary or m.user_id=auth.uid()) and app.streak_out_on(m.user_id,p_from,p_to) is null)) r
  from public.memberships m join public.profiles p on p.user_id=m.user_id
  join public.group_sharing s on s.group_id=m.group_id and s.user_id=m.user_id
  left join public.experience_preferences e on e.owner_id=m.user_id
  where m.group_id=p_group) q
$$;

create function public.read_group_game(p_group uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_today date:=app.local_day();cur record;prev record;v_members jsonb;v_last jsonb;v_badges jsonb:='[]'::jsonb;v_prev_standings jsonb;v_before jsonb;v_next jsonb;v_group public.groups%rowtype;
 v_team integer;v_last_team integer;v_len integer;
begin
 if not app.member_of_group(p_group,auth.uid()) then raise exception 'Group not found'; end if;
 select * into v_group from public.groups where id=p_group;
 select * into cur from app.group_period(p_group,v_today);
 -- Current standings plus today's progress and whether I already cheered each person today.
 select coalesce(jsonb_agg(r||jsonb_build_object(
   'due_today',case when (r->>'visible')::boolean then (app.day_tally((r->>'user_id')::uuid,v_today)).due end,
   'done_today',case when (r->>'visible')::boolean then (app.day_tally((r->>'user_id')::uuid,v_today)).done end,
   'cheered_today',exists(select 1 from public.garden_cheers g where g.group_id=p_group and g.from_user=auth.uid() and g.to_user=(r->>'user_id')::uuid and app.cheer_day(g.created_at)=v_today))),'[]'::jsonb)
  into v_members from jsonb_array_elements(app.group_standings(p_group,cur.kind,cur.starts_on,cur.ends_on)) r;
 select coalesce(sum((r->>'checkoffs')::int),0) into v_team from jsonb_array_elements(v_members) r where (r->>'visible')::boolean;
 select jsonb_build_object('kind',c.kind,'starts_on',c.starts_on,'ends_on',c.ends_on) into v_next from public.group_challenges c where c.group_id=p_group and c.starts_on>v_today order by c.starts_on limit 1;
 -- Last game: the period that ended the day before this one started.
 select * into prev from app.group_period(p_group,cur.starts_on-1);
 if prev.ends_on>=cur.starts_on then prev.ends_on:=cur.starts_on-1; end if;
 v_prev_standings:=app.group_standings(p_group,prev.kind,prev.starts_on,prev.ends_on);
 if exists(select 1 from jsonb_array_elements(v_prev_standings) r where (r->>'points')::int>0) then
  v_len:=prev.ends_on-prev.starts_on;
  v_before:=app.group_standings(p_group,'race',prev.starts_on-v_len-1,prev.starts_on-1);
  select coalesce(sum((r->>'checkoffs')::int),0) into v_last_team from jsonb_array_elements(v_prev_standings) r where (r->>'visible')::boolean;
  -- Never missed: shared progress, had habits scheduled, and finished every one every day.
  select v_badges||coalesce(jsonb_agg(jsonb_build_object('kind','never_missed','user_id',r->>'user_id','name',r->>'name')),'[]'::jsonb) into v_badges
   from jsonb_array_elements(v_prev_standings) r where (r->>'visible')::boolean
   and exists(select 1 from generate_series(prev.starts_on,prev.ends_on,'1 day'::interval) d(day) where (app.day_tally((r->>'user_id')::uuid,d.day::date)).due>0)
   and not exists(select 1 from generate_series(prev.starts_on,prev.ends_on,'1 day'::interval) d(day) cross join lateral app.day_tally((r->>'user_id')::uuid,d.day::date) x where x.due>0 and x.done<x.due);
  -- Big comeback: the largest gain over the game before (at least 3 points).
  select v_badges||coalesce((select jsonb_build_array(jsonb_build_object('kind','comeback','user_id',a->>'user_id','name',a->>'name','detail',(a->>'points')::int-(b->>'points')::int))
   from jsonb_array_elements(v_prev_standings) a join jsonb_array_elements(v_before) b on b->>'user_id'=a->>'user_id'
   where (a->>'visible')::boolean and (a->>'points')::int-(b->>'points')::int>=3 order by (a->>'points')::int-(b->>'points')::int desc limit 1),'[]'::jsonb) into v_badges;
  -- Top cheerleader: most cheers sent in this group during the game.
  select v_badges||coalesce((select jsonb_build_array(jsonb_build_object('kind','cheerleader','user_id',g.from_user,'name',p.display_name,'detail',count(*)))
   from public.garden_cheers g join public.profiles p on p.user_id=g.from_user
   where g.group_id=p_group and app.cheer_day(g.created_at) between prev.starts_on and prev.ends_on and app.member_of_group(p_group,g.from_user)
   group by g.from_user,p.display_name order by count(*) desc,p.display_name limit 1),'[]'::jsonb) into v_badges;
  v_last:=jsonb_build_object('kind',prev.kind,'starts_on',prev.starts_on,'ends_on',prev.ends_on,'team_target',prev.team_target,'team_total',v_last_team,'standings',v_prev_standings,'badges',v_badges);
 end if;
 return jsonb_build_object('group',jsonb_build_object('id',v_group.id,'name',v_group.name,'owner_id',v_group.owner_id),
  'today',v_today,
  'game',jsonb_build_object('kind',cur.kind,'starts_on',cur.starts_on,'ends_on',cur.ends_on,'team_target',cur.team_target,'team_total',v_team,'chosen',cur.challenge_id is not null),
  'next',v_next,'members',v_members,'last',v_last);
end $$;

-- Starts a game tomorrow for 3, 7 or 14 days. It replaces anything scheduled and ends the
-- current game today. A team goal is set from everyone's schedules (about 70% of them).
create function public.start_group_challenge(p_group uuid,p_kind text,p_days integer) returns uuid language plpgsql security definer set search_path=public as $$
declare v_start date:=app.local_day()+1;v_end date;v_target integer;v_id uuid;
begin
 if not app.member_of_group(p_group,auth.uid()) then raise exception 'Group not found'; end if;
 if p_kind not in ('race','team','streak') or p_days not in (3,7,14) then raise exception 'Choose a game and a length'; end if;
 v_end:=v_start+p_days-1;
 delete from public.group_challenges where group_id=p_group and starts_on>=v_start;
 update public.group_challenges set ends_on=app.local_day() where group_id=p_group and starts_on<=app.local_day() and ends_on>app.local_day();
 if p_kind='team' then
  select greatest(5,round(0.7*coalesce(sum((app.day_tally(m.user_id,d.day::date)).due),0)))::int into v_target
  from public.memberships m join public.group_sharing s on s.group_id=m.group_id and s.user_id=m.user_id
  cross join generate_series(v_start,v_end,'1 day'::interval) d(day) where m.group_id=p_group and s.show_summary;
 end if;
 insert into public.group_challenges(group_id,kind,starts_on,ends_on,team_target,created_by) values(p_group,p_kind,v_start,v_end,v_target,auth.uid()) returning id into v_id;
 return v_id;
end $$;

-- Reusable link: any number of joins for 7 days. Owners can still turn every link off.
create function public.issue_group_link(p_group uuid) returns text language plpgsql security definer set search_path=public,extensions as $$
declare v_token text;
begin
 if not exists(select 1 from public.groups where id=p_group and owner_id=auth.uid()) then raise exception 'Only the group owner can invite'; end if;
 if (select count(*) from public.invitations where group_id=p_group and reusable and expires_at>now())>=5 then raise exception 'Too many active links. Turn links off first.'; end if;
 v_token:=encode(gen_random_bytes(24),'hex');
 insert into public.invitations(group_id,token_hash,expires_at,created_by,reusable) values(p_group,encode(digest(v_token,'sha256'),'hex'),now()+interval '7 days',auth.uid(),true);
 return v_token;
end $$;

create or replace function public.redeem_invitation(p_token text) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_inv public.invitations%rowtype;
begin
 if auth.uid() is null or length(coalesce(p_token,''))<>48 then raise exception 'Invalid invitation'; end if;
 insert into public.profiles(user_id) values(auth.uid()) on conflict do nothing;
 select * into v_inv from public.invitations where token_hash=encode(digest(p_token,'sha256'),'hex') for update;
 if v_inv.id is null or v_inv.expires_at<=now() or v_inv.redeemed_at is not null then raise exception 'Invite expired or already used. Ask for a new one.'; end if;
 if app.member_of_group(v_inv.group_id,auth.uid()) then raise exception 'Already in this group'; end if;
 if (select count(*) from public.memberships where group_id=v_inv.group_id)>=20 then raise exception 'Group is full'; end if;
 if (select count(*) from public.memberships where user_id=auth.uid())>=20 then raise exception 'Maximum 20 groups per account'; end if;
 insert into public.memberships(group_id,user_id) values(v_inv.group_id,auth.uid());
 insert into public.group_sharing(group_id,user_id) values(v_inv.group_id,auth.uid());
 if not v_inv.reusable then update public.invitations set redeemed_at=now() where id=v_inv.id; end if;
 perform app.audit_change(auth.uid(),'memberships',v_inv.group_id::text||':'||auth.uid()::text,null,jsonb_build_object('group_id',v_inv.group_id,'user_id',auth.uid(),'revision',1));
 return v_inv.group_id;
end $$;

-- One cheer per person per day (Eastern), still at most five a day per group.
create or replace function public.send_garden_cheer(p_group uuid,p_to uuid,p_kind text) returns void language plpgsql security definer set search_path=public as $$
declare v_new public.garden_cheers%rowtype;
begin
 if not app.member_of_group(p_group,auth.uid()) or not app.member_of_group(p_group,p_to) or p_to=auth.uid() or p_kind not in ('you_got_this','nice_work','thank_you') then raise exception 'Invalid cheer'; end if;
 if exists(select 1 from public.garden_cheers where group_id=p_group and from_user=auth.uid() and to_user=p_to and app.cheer_day(created_at)=app.local_day()) then raise exception 'You already cheered them today'; end if;
 if (select count(*) from public.garden_cheers where group_id=p_group and from_user=auth.uid() and app.cheer_day(created_at)=app.local_day())>=5 then raise exception 'Five cheers per day maximum'; end if;
 insert into public.garden_cheers(group_id,from_user,to_user,kind) values(p_group,auth.uid(),p_to,p_kind) returning * into v_new;
 perform app.audit_change(auth.uid(),'garden_cheers',v_new.id::text,null,(to_jsonb(v_new)-'push_state'-'push_attempts'-'push_lease_until')||jsonb_build_object('revision',1));
end $$;

revoke execute on function public.read_group_game(uuid),public.start_group_challenge(uuid,text,integer),public.issue_group_link(uuid) from public,anon;
grant execute on function public.read_group_game(uuid),public.start_group_challenge(uuid,text,integer),public.issue_group_link(uuid) to authenticated;
