create or replace function public.game2_state(code_input text, kind_input text, name_input text default null, token_input text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms; p public.game_players; result jsonb; choices jsonb; selected_name text; defender_name text; ballot_received integer;
begin
  -- Lock the room before updating player presence, matching vote and reveal actions.
  select * into r from public.game_rooms where code = upper(trim(code_input)) for update;
  if not found then raise exception 'Room code not found'; end if;
  if kind_input = 'player' then
    if not exists (select 1 from public.game_players where room_id = r.id and lower(name) = lower(trim(coalesce(name_input, '')))) then raise exception 'Player not found'; end if;
  elsif kind_input = 'host' then
    if r.host_token is null or r.host_token::text is distinct from token_input then raise exception 'Host session not recognized'; end if;
  elsif kind_input = 'tv' then
    if r.tv_token::text is distinct from token_input then raise exception 'TV session not recognized'; end if;
  else raise exception 'Invalid participant type'; end if;
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
