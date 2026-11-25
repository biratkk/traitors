import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Monitor, Users, Crown } from 'lucide-react'
import App from './App.jsx'
import { supabase } from './lib/supabase.js'
import './multiplayer.css'

const SESSION_KEY = 'traitors-v2-session'

async function rpc(name, args = {}, signal = null) {
  if (!supabase) throw new Error('The game server is not configured.')
  let query = supabase.rpc(name, args)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY))
  } catch {
    return null
  }
}

function Entry({ onJoin }) {
  const [kind, setKind] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result =
        kind === 'tv'
          ? await rpc('game_create')
          : await rpc('game_join', {
              code_input: code,
              kind_input: kind,
              name_input: kind === 'player' ? name : null,
              token_input: null,
            })
      onJoin({ kind, ...result })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!kind)
    return (
      <main className="entry-screen">
        <h1>I am...</h1>
        <div className="role-grid">
          <button
            className="role-card role-host"
            onClick={() => setKind('host')}
          >
            <Crown />
            <span>Host</span>
          </button>
          <button className="role-card role-tv" onClick={() => setKind('tv')}>
            <Monitor />
            <span>TV</span>
          </button>
          <button
            className="role-card role-player"
            onClick={() => setKind('player')}
          >
            <Users />
            <span>Player</span>
          </button>
        </div>
      </main>
    )

  return (
    <main className="entry-screen">
      <button
        className="round-back"
        onClick={() => {
          setKind('')
          setError('')
        }}
      >
        <ArrowLeft size={20} /> Back
      </button>
      <form className="join-form" onSubmit={submit}>
        <h1>
          {kind === 'tv'
            ? 'Start a game'
            : kind === 'host'
              ? 'Join as host'
              : 'Join as a player'}
        </h1>
        {kind === 'tv' ? (
          <p>Start the game on the TV. The room code will appear there.</p>
        ) : (
          <>
            <label htmlFor="room-code">Room code</label>
            <input
              id="room-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              required
            />
            {kind === 'player' && (
              <>
                <label htmlFor="join-name">Your name</label>
                <input
                  id="join-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={24}
                  autoComplete="name"
                  required
                />
              </>
            )}
          </>
        )}
        {error && (
          <p className="game-error" role="alert">
            {error}
          </p>
        )}
        <button className="join-submit" disabled={busy}>
          {busy ? 'Connecting...' : kind === 'tv' ? 'Create game' : 'Join game'}
        </button>
      </form>
    </main>
  )
}

function GameControls({ session, game, connection, command, leave }) {
  const [count, setCount] = useState(2)
  const [error, setError] = useState('')
  async function run(action, value) {
    setError('')
    try {
      await command(action, value)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <div className="game-controls">
      <div className="game-header">
        <span>
          {connection === 'connected' ? 'Connected' : 'Reconnecting...'}
        </span>
        <span>Phase: {game.phase.replaceAll('_', ' ')}</span>
        {session.kind === 'tv' && <strong>Room code: {session.code}</strong>}
        <button onClick={leave}>Leave</button>
      </div>
      {game.phase === 'lobby' ? (
        <div className="game-actions">
          <label>
            Traitors{' '}
            <input
              type="number"
              min="1"
              max="15"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>
          <button onClick={() => run('assign', String(count))}>
            Assign roles
          </button>
          <span>Players join using the code on the TV.</span>
        </div>
      ) : (
        <div className="game-actions">
          <button onClick={() => run('day')}>Day</button>
          <button onClick={() => run('vote')}>Start vote</button>
          <button onClick={() => run('night')}>Start night</button>
          <button onClick={() => run('mission')}>Mission</button>
          {(game.phase === 'vote' || game.phase === 'night') && (
            <span>
              {game.received} / {game.eligible} choices locked
            </span>
          )}
        </div>
      )}
      {game.phase === 'vote_result' && (
        <div className="game-results">
          Vote results:{' '}
          {game.results
            ?.map((result) => `${result.name} (${result.votes})`)
            .join(', ')}
          . Use Banish to mark the result.
        </div>
      )}
      {game.phase === 'night_tie' && (
        <div className="game-actions">
          <span>Night vote tied. Choose a victim:</span>
          {game.ties.map((player) => (
            <button
              key={player.id}
              onClick={() => run('resolve_tie', player.id)}
            >
              {player.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="game-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function PlayerView({ game, connection, vote, leave }) {
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
  const isNightTraitor = game.phase === 'night' && self.role === 'traitor'
  const canVote =
    self.status === 'alive' &&
    !game.voted &&
    (game.phase === 'vote' || isNightTraitor)
  const targets = game.players.filter(
    (player) =>
      player.status === 'alive' &&
      player.id !== self.id &&
      (!isNightTraitor || !game.fellowTraitors.includes(player.name)),
  )
  async function choose(id) {
    setError('')
    setBusy(true)
    try {
      await vote(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  let instruction = 'Wait for the host to start the game.'
  if (self.status !== 'alive')
    instruction =
      self.status === 'killed'
        ? 'You have been killed.'
        : 'You have been banished.'
  else if (game.phase === 'mission')
    instruction = 'Look at the TV for mission instructions.'
  else if (game.phase === 'night_tie')
    instruction = 'Wait for the host to resolve the night vote.'
  else if (game.phase === 'night' && !isNightTraitor)
    instruction = 'Night falls. Sleep tight.'
  else if (game.voted)
    instruction = 'Your choice is locked. Wait for the other players.'
  else if (game.phase === 'vote')
    instruction = 'Cast your vote. Your choice is final.'
  else if (isNightTraitor)
    instruction = 'Choose one victim. Your choice is final.'
  else if (game.phase === 'vote_result')
    instruction = 'Voting is complete. Look at the TV.'
  else if (game.phase === 'day')
    instruction = 'Look at the TV and wait for the host.'
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
        {roleVisible && self.role === 'traitor' && game.fellowTraitors.length > 0 && (
          <p>Other traitors: {game.fellowTraitors.join(', ')}</p>
        )}
      </div>
      <div className="player-instruction" role="status">
        {instruction}
      </div>
      {error && (
        <p className="game-error" role="alert">
          {error}
        </p>
      )}
      {canVote && (
        <div className="player-targets">
          {targets.map((player, index) => (
            <button
              key={player.id}
              className={`round-color-${index % 4}`}
              disabled={busy || connection !== 'connected'}
              onClick={() => choose(player.id)}
            >
              {player.name}
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

export default function Multiplayer() {
  const [session, setSession] = useState(readSession)
  const [game, setGame] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState('')
  const requestSequence = useRef(0)
  const refreshInFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!session || refreshInFlight.current) return
    refreshInFlight.current = true
    const request = ++requestSequence.current
    const controller = new AbortController()
    let timeout
    try {
      const result = await Promise.race([
        rpc(
          'game_state',
          {
            code_input: session.code,
            kind_input: session.kind,
            name_input: session.name || null,
            token_input: session.token || null,
          },
          controller.signal,
        ),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort()
            reject(new Error('Connection timed out'))
          }, 5000)
        }),
      ])
      if (request === requestSequence.current) {
        setGame(result)
        setConnection('connected')
        setError('')
      }
    } catch (err) {
      if (request === requestSequence.current) {
        setConnection('disconnected')
        setError(err.message)
      }
    } finally {
      clearTimeout(timeout)
      refreshInFlight.current = false
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    let active = true
    async function update() {
      if (active) await refresh()
    }
    update()
    const timer = setInterval(update, 2000)
    window.addEventListener('online', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('online', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [session, refresh])

  function join(next) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    setGame(null)
    setSession(next)
  }
  function leave() {
    requestSequence.current++
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setGame(null)
    setError('')
  }
  async function command(action, value = null) {
    await rpc('game_command', {
      code_input: session.code,
      token_input: session.token,
      command_input: action,
      value_input: value,
    })
    await refresh()
  }
  async function vote(target) {
    await rpc('game_vote', {
      code_input: session.code,
      name_input: session.name,
      target_input: target,
    })
    await refresh()
  }
  if (!session) return <Entry onJoin={join} />
  if (!game)
    return (
      <main className="entry-screen">
        <h1>Connecting...</h1>
        {error && (
          <p className="game-error" role="alert">
            {error}
          </p>
        )}
        <button className="round-back" onClick={leave}>
          Back
        </button>
      </main>
    )
  if (session.kind === 'player')
    return (
      <PlayerView
        game={game}
        connection={connection}
        vote={vote}
        leave={leave}
      />
    )
  const controls = (
    <GameControls
      session={session}
      game={game}
      connection={connection}
      command={command}
      leave={leave}
    />
  )
  return <App multiplayer={{ game, command, controls }} />
}
