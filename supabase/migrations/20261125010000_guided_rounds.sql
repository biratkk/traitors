-- Timers are stored in the database. A state request advances expired phases.
alter table public.game_rooms
  add column phase_ends_at timestamptz,
  add column candidates uuid[] not null default '{}',
  add column defender_index integer not null default 1,
  add column selected_player uuid references public.game_players(id),
  add column revealed_role text;

alter table public.game_votes drop constraint game_votes_phase_check;
alter table public.game_votes add constraint game_votes_phase_check
  check (phase in ('vote', 'revote', 'night'));

create table public.game_night_choices (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round integer not null,
  voter uuid not null references public.game_players(id) on delete cascade,
  target uuid not null references public.game_players(id) on delete cascade,
  locked boolean not null default false,
  primary key (room_id, round, voter)
);
alter table public.game_night_choices enable row level security;
revoke all on public.game_night_choices from anon, authenticated;

create function public.game2_advance(room_id_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms;
begin
  loop
    select * into r from public.game_rooms where id = room_id_input for update;
    if not found or r.phase_ends_at is null or r.phase_ends_at > now() then return; end if;
    if r.phase = 'mission' then
      update public.game_rooms set phase = 'discussion', phase_ends_at = r.phase_ends_at + interval '5 minutes' where id = r.id;
    elsif r.phase = 'discussion' then
      update public.game_rooms set phase = 'vote', phase_ends_at = null, round = round + 1 where id = r.id;
    elsif r.phase = 'defense' then
      if r.defender_index < cardinality(r.candidates) then
        update public.game_rooms set defender_index = defender_index + 1, phase_ends_at = r.phase_ends_at + interval '1 minute' where id = r.id;
      else
        update public.game_rooms set phase = 'revote', phase_ends_at = null, round = round + 1 where id = r.id;
      end if;
    elsif r.phase = 'blindfold' then
      update public.game_players set status = 'killed' where room_id = r.id and id = r.selected_player and status = 'alive';
      update public.game_rooms set phase = 'morning', phase_ends_at = null where id = r.id;
    else
      return;
    end if;
  end loop;
end $$;
revoke all on function public.game2_advance(uuid) from public, anon, authenticated;

create function public.game2_state(code_input text, kind_input text, name_input text default null, token_input text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; p public.game_players; result jsonb; choices jsonb; selected_name text; defender_name text; ballot_received integer;
begin
  -- Validate the session before advancing the room. This also updates presence.
  perform public.game_state(code_input, kind_input, name_input, token_input);
  select * into r from public.game_rooms where code = upper(trim(code_input));
  perform public.game2_advance(r.id);
  select * into r from public.game_rooms where id = r.id;
  result := public.game_state(code_input, kind_input, name_input, token_input);
  select name into selected_name from public.game_players where id = r.selected_player and room_id = r.id;
  select name into defender_name from public.game_players where id = r.candidates[r.defender_index] and room_id = r.id;
  select count(*) into ballot_received from public.game_votes where room_id = r.id and round = r.round and phase = r.phase;
  result := result || jsonb_build_object(
    'phaseEndsAt', r.phase_ends_at, 'serverTime', now(), 'defender', defender_name,
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by joined_at) from public.game_players where room_id = r.id and id = any(r.candidates)), '[]'::jsonb),
    'selectedPlayer', case when r.phase in ('banishment','revealed','morning') then selected_name else null end,
    'revealedRole', case when r.phase = 'revealed' then r.revealed_role else null end,
    'received', case when r.phase in ('vote','revote') then ballot_received else (result->>'received')::integer end
  );
  if kind_input = 'player' then
    select * into p from public.game_players where room_id = r.id and lower(name) = lower(trim(name_input));
    result := result || jsonb_build_object('isSelected', r.phase = 'banishment' and p.id = r.selected_player);
    if r.phase = 'night' and p.role = 'traitor' and p.status = 'alive' then
      select coalesce(jsonb_agg(jsonb_build_object('name', voter.name, 'targetId', choice.target, 'targetName', target.name, 'locked', choice.locked) order by voter.joined_at), '[]'::jsonb)
        into choices from public.game_night_choices choice
        join public.game_players voter on voter.id = choice.voter
        join public.game_players target on target.id = choice.target
        where choice.room_id = r.id and choice.round = r.round;
      result := result || jsonb_build_object('nightChoices', choices,
        'nightLocked', exists(select 1 from public.game_night_choices where room_id = r.id and round = r.round and voter = p.id and locked));
    end if;
  end if;
  return result;
end $$;

create function public.game2_command(code_input text, token_input text, command_input text, value_input text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; total integer; n integer;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found or r.host_token is null or r.host_token::text is distinct from token_input then raise exception 'Host session not recognized'; end if;
  perform public.game2_advance(r.id);
  select * into r from public.game_rooms where id = r.id;
  if command_input = 'assign' and r.phase = 'lobby' then
    select count(*) into total from public.game_players where room_id = r.id and status = 'alive';
    begin n := value_input::integer; exception when others then raise exception 'Choose the number of traitors'; end;
    if n is null or n < 1 or n >= total then raise exception 'Choose at least one traitor and leave at least one faithful'; end if;
    update public.game_players set role = 'traitor' where id in (select id from public.game_players where room_id = r.id and status = 'alive' order by random() limit n);
    update public.game_rooms set phase = 'ready', traitor_count = n where id = r.id;
  elsif command_input = 'start_mission' and r.phase in ('ready','morning') then
    update public.game_rooms set phase = 'mission', phase_ends_at = now() + interval '5 minutes', selected_player = null, revealed_role = null, candidates = '{}' where id = r.id;
  elsif command_input = 'skip_mission' and r.phase = 'mission' then
    update public.game_rooms set phase = 'discussion', phase_ends_at = now() + interval '5 minutes' where id = r.id;
  elsif command_input = 'start_night' and r.phase = 'revealed' then
    update public.game_rooms set phase = 'night', phase_ends_at = null, selected_player = null, revealed_role = null, round = round + 1 where id = r.id;
  else raise exception 'That action is not available now'; end if;
end $$;

create function public.game2_vote(code_input text, name_input text, target_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; current_player public.game_players; target_player public.game_players; eligible integer; received integer; leaders uuid[];
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found then raise exception 'Room code not found'; end if;
  perform public.game2_advance(r.id);
  select * into r from public.game_rooms where id = r.id;
  if r.phase not in ('vote','revote') then raise exception 'Voting is not open'; end if;
  select * into current_player from public.game_players where room_id = r.id and lower(name) = lower(trim(name_input));
  if not found or current_player.status <> 'alive' then raise exception 'You cannot vote'; end if;
  select * into target_player from public.game_players where room_id = r.id and id = target_input and status = 'alive';
  if not found or target_player.id = current_player.id or (r.phase = 'revote' and not (target_player.id = any(r.candidates))) then raise exception 'Choose an eligible player'; end if;
  insert into public.game_votes(room_id, round, phase, voter, target) values (r.id, r.round, r.phase, current_player.id, target_player.id);
  select count(*) into eligible from public.game_players where room_id = r.id and status = 'alive';
  select count(*) into received from public.game_votes where room_id = r.id and round = r.round and phase = r.phase;
  if received = eligible then
    select array_agg(q.target order by q.joined_at) into leaders from (
      select v.target, p.joined_at from public.game_votes v join public.game_players p on p.id = v.target
      where v.room_id = r.id and v.round = r.round and v.phase = r.phase group by v.target, p.joined_at
      having count(*) = (select max(counts.n) from (select count(*) n from public.game_votes where room_id = r.id and round = r.round and phase = r.phase group by target) counts)
    ) q;
    if cardinality(leaders) = 1 then
      update public.game_rooms set phase = 'banishment', selected_player = leaders[1], phase_ends_at = null, candidates = '{}' where id = r.id;
    else
      update public.game_rooms set phase = 'defense', candidates = leaders, defender_index = 1, phase_ends_at = now() + interval '1 minute' where id = r.id;
    end if;
  end if;
exception when unique_violation then raise exception 'Your choice is already locked';
end $$;

create function public.game2_reveal(code_input text, name_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; p public.game_players;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found or r.phase <> 'banishment' then raise exception 'There is no role to reveal'; end if;
  select * into p from public.game_players where room_id = r.id and id = r.selected_player and lower(name) = lower(trim(name_input));
  if not found then raise exception 'Only the banished player can reveal their role'; end if;
  update public.game_players set status = 'banished' where id = p.id;
  update public.game_rooms set phase = 'revealed', revealed_role = p.role where id = r.id;
end $$;

create function public.game2_night_choice(code_input text, name_input text, target_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; current_player public.game_players; target_player public.game_players; locked_target uuid;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found or r.phase <> 'night' then raise exception 'Night choices are not open'; end if;
  select * into current_player from public.game_players where room_id = r.id and lower(name) = lower(trim(name_input)) and role = 'traitor' and status = 'alive';
  if not found then raise exception 'Only living traitors can choose'; end if;
  select * into target_player from public.game_players where room_id = r.id and id = target_input and role = 'faithful' and status = 'alive';
  if not found then raise exception 'Choose a living faithful'; end if;
  if exists(select 1 from public.game_night_choices where room_id = r.id and round = r.round and voter = current_player.id and locked) then raise exception 'Your choice is already locked'; end if;
  select target into locked_target from public.game_night_choices where room_id = r.id and round = r.round and locked limit 1;
  if locked_target is not null and locked_target <> target_player.id then raise exception 'A traitor has locked the agreed choice'; end if;
  insert into public.game_night_choices(room_id, round, voter, target) values (r.id, r.round, current_player.id, target_player.id)
    on conflict (room_id, round, voter) do update set target = excluded.target;
end $$;

create function public.game2_night_lock(code_input text, name_input text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; current_player public.game_players; eligible integer; selected integer; distinct_targets integer; locked_count integer; victim uuid;
begin
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found or r.phase <> 'night' then raise exception 'Night choices are not open'; end if;
  select * into current_player from public.game_players where room_id = r.id and lower(name) = lower(trim(name_input)) and role = 'traitor' and status = 'alive';
  if not found then raise exception 'Only living traitors can lock a choice'; end if;
  select count(*) into eligible from public.game_players where room_id = r.id and role = 'traitor' and status = 'alive';
  select count(*), count(distinct target), min(target::text)::uuid into selected, distinct_targets, victim from public.game_night_choices where room_id = r.id and round = r.round;
  if selected <> eligible or distinct_targets <> 1 then raise exception 'All traitors must choose the same victim before locking in'; end if;
  update public.game_night_choices set locked = true where room_id = r.id and round = r.round and voter = current_player.id and not locked;
  if not found then raise exception 'Your choice is already locked'; end if;
  select count(*) into locked_count from public.game_night_choices where room_id = r.id and round = r.round and locked;
  if locked_count = eligible then
    update public.game_rooms set phase = 'blindfold', selected_player = victim, phase_ends_at = now() + interval '40 seconds' where id = r.id;
  end if;
end $$;

revoke all on function public.game2_state(text,text,text,text), public.game2_command(text,text,text,text), public.game2_vote(text,text,uuid), public.game2_reveal(text,text), public.game2_night_choice(text,text,uuid), public.game2_night_lock(text,text) from public;
grant execute on function public.game2_state(text,text,text,text), public.game2_command(text,text,text,text), public.game2_vote(text,text,uuid), public.game2_reveal(text,text), public.game2_night_choice(text,text,uuid), public.game2_night_lock(text,text) to anon, authenticated;
