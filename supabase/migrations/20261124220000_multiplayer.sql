-- The room code and player name are deliberately the recovery credentials.
-- Anyone who knows both can impersonate a player. Do not expose these tables.
create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tv_token uuid not null default gen_random_uuid(),
  host_token uuid,
  phase text not null default 'lobby',
  round integer not null default 0,
  traitor_count integer not null default 2,
  created_at timestamptz not null default now()
);
create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  name text not null,
  status text not null default 'alive' check (status in ('alive', 'killed', 'banished')),
  role text not null default 'faithful' check (role in ('faithful', 'traitor')),
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now()
);
create unique index game_players_unique_name on public.game_players (room_id, lower(name));
create table public.game_votes (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round integer not null,
  phase text not null check (phase in ('vote', 'night')),
  voter uuid not null references public.game_players(id) on delete cascade,
  target uuid not null references public.game_players(id) on delete cascade,
  primary key (room_id, round, phase, voter)
);
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.game_votes enable row level security;
revoke all on public.game_rooms, public.game_players, public.game_votes from anon, authenticated;

create function public.game_create() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms;
begin
  loop
    begin
      insert into public.game_rooms(code) values (upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))) returning * into r;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('code', r.code, 'token', r.tv_token);
end $$;

create function public.game_join(code_input text, kind_input text, name_input text default null, token_input text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; p public.game_players; token uuid;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found then raise exception 'Room code not found'; end if;
  if kind_input = 'host' then
    if r.host_token is null then
      update public.game_rooms set host_token = gen_random_uuid() where id = r.id returning host_token into token;
    elsif token_input is not null and r.host_token::text = token_input then
      token := r.host_token;
    else
      raise exception 'A host has already joined this game';
    end if;
    return jsonb_build_object('code', r.code, 'token', token);
  elsif kind_input = 'player' then
    if length(trim(coalesce(name_input, ''))) < 1 or length(trim(name_input)) > 24 then raise exception 'Enter a name of 1 to 24 characters'; end if;
    select * into p from public.game_players where room_id = r.id and lower(name) = lower(trim(name_input));
    if not found then
      if r.phase <> 'lobby' then raise exception 'The game has already started'; end if;
      if (select count(*) from public.game_players where room_id = r.id) >= 16 then raise exception 'This game is full'; end if;
      insert into public.game_players(room_id, name) values (r.id, trim(name_input)) returning * into p;
    else
      update public.game_players set last_seen = now() where id = p.id;
    end if;
    return jsonb_build_object('code', r.code, 'name', p.name);
  end if;
  raise exception 'Invalid participant type';
end $$;

create function public.game_state(code_input text, kind_input text, name_input text default null, token_input text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; p public.game_players; eligible integer; received integer; result jsonb; ties jsonb;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input));
  if not found then raise exception 'Room code not found'; end if;
  if kind_input = 'player' then
    select * into p from public.game_players where room_id = r.id and lower(name) = lower(trim(coalesce(name_input, '')));
    if not found then raise exception 'Player not found'; end if;
    update public.game_players set last_seen = now() where id = p.id;
  elsif kind_input = 'host' then
    if r.host_token is null or r.host_token::text is distinct from token_input then raise exception 'Host session not recognized'; end if;
  elsif kind_input = 'tv' then
    if r.tv_token::text is distinct from token_input then raise exception 'TV session not recognized'; end if;
  else raise exception 'Invalid participant type'; end if;
  select count(*) into eligible from public.game_players where room_id = r.id and status = 'alive' and (r.phase <> 'night' or role = 'traitor');
  select count(*) into received from public.game_votes where room_id = r.id and round = r.round and phase = r.phase;
  if r.phase = 'night_tie' and kind_input in ('host','tv') then
    select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name) order by q.name) into ties from (
      select p2.id, p2.name, count(*) as votes from public.game_votes v join public.game_players p2 on p2.id = v.target
      where v.room_id = r.id and v.round = r.round and v.phase = 'night' group by p2.id, p2.name
      having count(*) = (select max(counts.n) from (select count(*) n from public.game_votes where room_id = r.id and round = r.round and phase = 'night' group by target) counts)
    ) q;
  end if;
  result := jsonb_build_object(
    'phase', r.phase, 'round', r.round, 'traitorCount', r.traitor_count,
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'connected', last_seen > now() - interval '30 seconds') order by joined_at) from public.game_players where room_id = r.id), '[]'::jsonb),
    'eligible', eligible, 'received', received, 'ties', coalesce(ties, '[]'::jsonb)
  );
  if kind_input = 'player' then
    result := result || jsonb_build_object('self', jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'role', case when r.phase = 'lobby' then null else p.role end),
      'voted', exists(select 1 from public.game_votes where room_id = r.id and round = r.round and phase = r.phase and voter = p.id),
      'fellowTraitors', case when p.role = 'traitor' and r.phase <> 'lobby' then coalesce((select jsonb_agg(name order by name) from public.game_players where room_id = r.id and role = 'traitor' and id <> p.id), '[]'::jsonb) else '[]'::jsonb end);
  end if;
  if r.phase = 'vote_result' and kind_input in ('host','tv') then
    result := result || jsonb_build_object('results', coalesce((select jsonb_agg(jsonb_build_object('name', q.name, 'votes', q.votes) order by q.votes desc, q.name) from (select p2.name, count(*) as votes from public.game_votes v join public.game_players p2 on p2.id = v.target where v.room_id = r.id and v.round = r.round and v.phase = 'vote' group by p2.name) q), '[]'::jsonb));
  end if;
  return result;
end $$;

create function public.game_command(code_input text, token_input text, command_input text, value_input text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; total integer; n integer; target_id uuid;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found or (r.host_token::text is distinct from token_input and r.tv_token::text is distinct from token_input) then raise exception 'Host or TV session not recognized'; end if;
  if command_input = 'assign' then
    if r.phase <> 'lobby' then raise exception 'Roles are already assigned'; end if;
    select count(*) into total from public.game_players where room_id = r.id and status = 'alive';
    begin n := value_input::integer; exception when others then raise exception 'Choose the number of traitors'; end;
    if n < 1 or n >= total then raise exception 'Choose at least one traitor and leave at least one faithful'; end if;
    update public.game_players set role = 'traitor' where id in (select id from public.game_players where room_id = r.id and status = 'alive' order by random() limit n);
    update public.game_rooms set phase = 'day', traitor_count = n where id = r.id;
  elsif command_input in ('vote', 'night', 'mission', 'day') then
    if r.phase = 'lobby' then raise exception 'Assign roles first'; end if;
    update public.game_rooms set phase = command_input, round = round + 1 where id = r.id;
  elsif command_input in ('kill', 'banish') then
    begin target_id := value_input::uuid; exception when others then raise exception 'Choose a valid player'; end;
    update public.game_players set status = case when command_input = 'kill' then 'killed' else 'banished' end where room_id = r.id and id = target_id and status = 'alive';
    if not found then raise exception 'Player is not in the game'; end if;
  elsif command_input = 'resolve_tie' then
    if r.phase <> 'night_tie' then raise exception 'There is no tie to resolve'; end if;
    begin target_id := value_input::uuid; exception when others then raise exception 'Choose a valid player'; end;
    if not exists (select 1 from public.game_votes where room_id = r.id and round = r.round and phase = 'night' and target = target_id group by target having count(*) = (select max(counts.n) from (select count(*) n from public.game_votes where room_id = r.id and round = r.round and phase = 'night' group by target) counts)) then raise exception 'Choose a tied player'; end if;
    update public.game_players set status = 'killed' where room_id = r.id and id = target_id and status = 'alive';
    update public.game_rooms set phase = 'day' where id = r.id;
  else raise exception 'Unknown game action'; end if;
end $$;

create function public.game_vote(code_input text, name_input text, target_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; p public.game_players; target_player public.game_players; eligible integer; received integer; winners integer; winner uuid;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found or r.phase not in ('vote', 'night') then raise exception 'Voting is not open'; end if;
  select * into p from public.game_players where room_id = r.id and lower(name) = lower(trim(name_input));
  if not found or p.status <> 'alive' then raise exception 'You cannot vote'; end if;
  if r.phase = 'night' and p.role <> 'traitor' then raise exception 'Only traitors can choose a victim'; end if;
  select * into target_player from public.game_players where room_id = r.id and id = target_input and status = 'alive';
  if not found or target_player.id = p.id or (r.phase = 'night' and target_player.role = 'traitor') then raise exception 'Choose an eligible player'; end if;
  insert into public.game_votes(room_id, round, phase, voter, target) values (r.id, r.round, r.phase, p.id, target_player.id);
  select count(*) into eligible from public.game_players where room_id = r.id and status = 'alive' and (r.phase <> 'night' or role = 'traitor');
  select count(*) into received from public.game_votes where room_id = r.id and round = r.round and phase = r.phase;
  if received >= eligible then
    if r.phase = 'vote' then update public.game_rooms set phase = 'vote_result' where id = r.id;
    else
      select count(*), min(target::text)::uuid into winners, winner from (select target, count(*) n from public.game_votes where room_id = r.id and round = r.round and phase = 'night' group by target having count(*) = (select max(counts.n) from (select count(*) n from public.game_votes where room_id = r.id and round = r.round and phase = 'night' group by target) counts)) leaders;
      if winners = 1 then
        update public.game_players set status = 'killed' where id = winner and room_id = r.id;
        update public.game_rooms set phase = 'day' where id = r.id;
      else update public.game_rooms set phase = 'night_tie' where id = r.id; end if;
    end if;
  end if;
exception when unique_violation then raise exception 'Your choice is already locked';
end $$;

revoke all on function public.game_create(), public.game_join(text,text,text,text), public.game_state(text,text,text,text), public.game_command(text,text,text,text), public.game_vote(text,text,uuid) from public;
grant execute on function public.game_create(), public.game_join(text,text,text,text), public.game_state(text,text,text,text), public.game_command(text,text,text,text), public.game_vote(text,text,uuid) to anon, authenticated;
