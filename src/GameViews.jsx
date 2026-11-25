import { useEffect, useState } from 'react'
import { useNightAudio } from './useNightAudio.js'

function useCountdown(game) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  if (!game.phaseEndsAt || !game.serverTime || now === null) return null
  const remaining = Math.max(
    0,
    Date.parse(game.phaseEndsAt) -
      Date.parse(game.serverTime) -
      (now - game.receivedAt),
  )
  const seconds = Math.ceil(remaining / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function phaseMessage(game) {
  switch (game.phase) {
    case 'lobby':
      return {
        title: 'Welcome to the game',
        detail: 'Players and the host can join using the room code.',
      }
    case 'ready':
      return {
        title: 'The mission awaits',
        detail: 'The host will start the first mission.',
      }
    case 'mission':
      return {
        title: 'Mission in progress',
        detail: 'Follow the host’s mission instructions.',
      }
    case 'discussion':
      return {
        title: 'The round table',
        detail: 'Discuss who should be banished.',
      }
    case 'vote':
      return {
        title: 'Cast your vote',
        detail: 'Choose who to banish on your phone.',
      }
    case 'defense':
      return {
        title: `${game.defender}, defend yourself`,
        detail: 'You have one minute to speak.',
      }
    case 'revote':
      return {
        title: 'Vote again',
        detail: `Choose between the tied players: ${game.candidates.map((player) => player.name).join(', ')}.`,
      }
    case 'banishment':
      return {
        title: `${game.selectedPlayer}, please stand`,
        detail: 'Read the private prompt on your phone, then reveal your role.',
      }
    case 'revealed':
      return {
        title: `${game.selectedPlayer} was a ${game.revealedRole === 'traitor' ? 'Traitor' : 'Faithful'}`,
        detail: 'The host will begin the night.',
      }
    case 'night':
      return {
        title: 'Night has fallen',
        detail:
          'Everyone, put on your blindfold. Once everyone is blindfolded, traitors may remove theirs and choose a victim.',
      }
    case 'blindfold':
      return {
        title: 'Traitors, cover your eyes',
        detail: 'Put your blindfolds back on. Everyone else, keep yours on.',
      }
    case 'morning':
      return {
        title: 'An empty seat at breakfast',
        detail: `A new day has dawned, but not everyone made it to breakfast. ${game.selectedPlayer} was murdered.`,
      }
    default:
      return { title: 'Waiting for the game', detail: '' }
  }
}

function PlayerList({ players }) {
  return (
    <div className="status-list">
      {players.map((player) => (
        <div
          className={`status-card ${player.status === 'alive' ? 'status-alive-card' : 'status-out-card'}`}
          key={player.id}
        >
          <strong>{player.name}</strong>
          <span>
            {player.status === 'alive'
              ? 'Alive'
              : player.status === 'killed'
                ? 'Killed'
                : 'Banished'}
          </span>
          <small>{player.connected ? 'Connected' : 'Disconnected'}</small>
        </div>
      ))}
    </div>
  )
}

export function TVView({ game, session, connection }) {
  const timer = useCountdown(game)
  const message = phaseMessage(game)
  return (
    <main className="tv-view">
      <section className="tv-prompt">
        <div className="tv-meta">
          Room code: <strong>{session.code}</strong> ·{' '}
          {connection === 'connected' ? 'Connected' : 'Reconnecting...'}
        </div>
        <div className="tv-message">
          <h1>{message.title}</h1>
          <p>{message.detail}</p>
          {timer && (
            <div className="game-timer" aria-label={`Time remaining ${timer}`}>
              {timer}
            </div>
          )}
        </div>
      </section>
      <aside className="tv-players">
        <PlayerList players={game.players} />
      </aside>
    </main>
  )
}

export function HostView({ game, connection, command }) {
  const [count, setCount] = useState(2)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useCountdown(game)
  const audio = useNightAudio(game)
  const message = phaseMessage(game)
  async function run(action, value) {
    setError('')
    setBusy(true)
    try {
      if (action === 'start_night') await audio.enable()
      await command(action, value)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="host-screen">
      <div className="host-header">
        {connection === 'connected' ? 'Connected' : 'Reconnecting...'}
      </div>
      <div className="host-content">
        <section className="host-main">
          <h1>{message.title}</h1>
          <p>{message.detail}</p>
          {timer && <div className="game-timer">{timer}</div>}
          {game.phase === 'lobby' && (
            <div className="host-setup">
              <label>
                Number of traitors{' '}
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </label>
              <button
                disabled={busy || connection !== 'connected'}
                onClick={() => run('assign', String(count))}
              >
                Assign roles
              </button>
            </div>
          )}
          {['ready', 'morning'].includes(game.phase) && (
            <button
              className="host-primary"
              disabled={busy || connection !== 'connected'}
              onClick={() => run('start_mission')}
            >
              Start next mission
            </button>
          )}
          {game.phase === 'mission' && (
            <button
              className="host-primary"
              disabled={busy || connection !== 'connected'}
              onClick={() => run('skip_mission')}
            >
              Skip mission
            </button>
          )}
          {game.phase === 'revealed' && (
            <button
              className="host-primary night-start"
              disabled={busy || connection !== 'connected'}
              onClick={() => run('start_night')}
            >
              {busy ? 'Preparing sounds...' : 'Let the night begin'}
            </button>
          )}
          {game.phase === 'revealed' && (
            <p>
              Connect this device to the speaker and keep it awake for the night
              sounds.
            </p>
          )}
          {error && (
            <p className="game-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="host-players">
          <PlayerList players={game.players} />
        </aside>
      </div>
    </main>
  )
}

export function PlayerView({
  game,
  connection,
  vote,
  chooseNight,
  lockNight,
  reveal,
  leave,
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [roleVisible, setRoleVisible] = useState(false)
  useEffect(() => {
    function hideRole() {
      if (document.hidden) setRoleVisible(false)
    }
    document.addEventListener('visibilitychange', hideRole)
    return () => document.removeEventListener('visibilitychange', hideRole)
  }, [])
  const self = game.self
  const isTraitorNight =
    game.phase === 'night' && self.role === 'traitor' && self.status === 'alive'
  const ballot =
    ['vote', 'revote'].includes(game.phase) &&
    self.status === 'alive' &&
    !game.voted
  const candidates = new Set(game.candidates.map((player) => player.id))
  const targets = game.players.filter(
    (player) =>
      player.status === 'alive' &&
      player.id !== self.id &&
      (game.phase !== 'revote' || candidates.has(player.id)) &&
      (!isTraitorNight || !game.fellowTraitors.includes(player.name)),
  )
  const choices = game.nightChoices || []
  const ownChoice = choices.find((choice) => choice.name === self.name)
  const anyLocked = choices.some((choice) => choice.locked)
  const allAgree =
    choices.length === game.eligible &&
    new Set(choices.map((choice) => choice.targetId)).size === 1
  const traitorNames = [self.name, ...game.fellowTraitors].filter((name) =>
    game.players.some(
      (player) => player.name === name && player.status === 'alive',
    ),
  )
  async function act(action, value) {
    setError('')
    setBusy(true)
    try {
      await action(value)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  let instruction = 'Look at the TV and wait for the host.'
  if (game.isSelected)
    instruction = 'You have been chosen for banishment. Please stand.'
  else if (self.status !== 'alive')
    instruction =
      self.status === 'killed'
        ? 'You have been killed.'
        : 'You have been banished.'
  else if (game.phase === 'mission')
    instruction = 'Look at the TV for mission instructions.'
  else if (game.phase === 'discussion')
    instruction = 'Discuss who should be banished. Watch the TV for the timer.'
  else if (game.phase === 'defense')
    instruction =
      'Listen to the tied players defend themselves. Watch the TV for the timer.'
  else if (game.voted)
    instruction = 'Your vote is locked. Wait for the other players.'
  else if (ballot)
    instruction =
      game.phase === 'revote'
        ? 'Vote for one of the tied players.'
        : 'Cast your vote. Your choice is final.'
  else if (isTraitorNight)
    instruction =
      'Once everyone is blindfolded, traitors may uncover their eyes. Choose the same victim, then lock in.'
  else if (game.phase === 'night')
    instruction = 'Put on your blindfold. Keep it on until morning.'
  else if (game.phase === 'blindfold')
    instruction =
      'Traitors, put your blindfolds back on. Everyone else, keep yours on.'
  else if (game.phase === 'banishment')
    instruction = 'Look at the TV and wait for the role reveal.'
  return (
    <main className="player-screen">
      <div className="player-top">
        <span>
          {connection === 'connected' ? 'Connected' : 'Reconnecting...'}
        </span>
        <button onClick={leave}>Leave</button>
      </div>
      <div className="player-summary">
        <h1>{self.name}</h1>
        <p>Status: {self.status}</p>
        {self.role && (
          <button
            className="role-toggle"
            onClick={() => setRoleVisible((visible) => !visible)}
            aria-expanded={roleVisible}
          >
            {roleVisible ? 'Hide my role' : 'Show my role'}
          </button>
        )}
        {self.role && roleVisible && (
          <p>Your role: {self.role === 'traitor' ? 'Traitor' : 'Faithful'}</p>
        )}
        {roleVisible &&
          self.role === 'traitor' &&
          game.fellowTraitors.length > 0 && (
            <p>Other traitors: {game.fellowTraitors.join(', ')}</p>
          )}
      </div>
      <div className="player-instruction" role="status">
        {instruction}
      </div>
      {game.isSelected && (
        <div className="private-prompt">
          <strong>Private prompt. Do not read this aloud.</strong>
          <p>
            The room is silent. Take a moment, look around, and let the suspense
            build. When you are ready, reveal your true allegiance.
          </p>
          <button
            disabled={busy || connection !== 'connected'}
            onClick={() => act(reveal)}
          >
            Reveal my role
          </button>
        </div>
      )}
      {isTraitorNight && (
        <div className="night-choices">
          <h2>Traitor choices</h2>
          {traitorNames.map((name) => {
            const choice = choices.find((item) => item.name === name)
            return (
              <p key={name}>
                {name}:{' '}
                {choice
                  ? `${choice.targetName}${choice.locked ? ' (locked)' : ''}`
                  : 'Choosing...'}
              </p>
            )
          })}
          {ownChoice && (
            <button
              disabled={
                busy ||
                connection !== 'connected' ||
                game.nightLocked ||
                !allAgree
              }
              onClick={() => act(lockNight)}
            >
              {game.nightLocked ? 'Choice locked' : 'Lock in'}
            </button>
          )}
          {ownChoice && !allAgree && (
            <p>All traitors must choose the same victim before locking in.</p>
          )}
        </div>
      )}
      {error && (
        <p className="game-error" role="alert">
          {error}
        </p>
      )}
      {(ballot || (isTraitorNight && !game.nightLocked)) && (
        <div className="player-targets">
          {targets.map((player, index) => (
            <button
              key={player.id}
              className={`round-color-${index % 4}`}
              aria-pressed={isTraitorNight && ownChoice?.targetId === player.id}
              disabled={
                busy ||
                connection !== 'connected' ||
                (isTraitorNight && anyLocked)
              }
              onClick={() =>
                act(isTraitorNight ? chooseNight : vote, player.id)
              }
            >
              {player.name}
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
