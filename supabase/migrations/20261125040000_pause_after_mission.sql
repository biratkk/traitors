-- Wait for the host before starting the round-table timer.
create or replace function public.game2_advance(room_id_input uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.game_rooms;
begin
  loop
    select * into r from public.game_rooms where id = room_id_input for update;
    if not found or r.phase_ends_at is null or r.phase_ends_at > now() then return; end if;
    if r.phase = 'mission' then
      update public.game_rooms set phase = 'mission_complete', phase_ends_at = null where id = r.id;
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

create or replace function public.game2_command(code_input text, token_input text, command_input text, value_input text default null)
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
    update public.game_rooms set phase = 'mission_complete', phase_ends_at = null where id = r.id;
  elsif command_input = 'start_discussion' and r.phase = 'mission_complete' then
    update public.game_rooms set phase = 'discussion', phase_ends_at = now() + interval '5 minutes' where id = r.id;
  elsif command_input = 'start_night' and r.phase = 'revealed' then
    update public.game_rooms set phase = 'night', phase_ends_at = null, selected_player = null, revealed_role = null, round = round + 1 where id = r.id;
  else raise exception 'That action is not available now'; end if;
end $$;

