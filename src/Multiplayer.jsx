import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Monitor, Users, Crown } from 'lucide-react'
import { HostView, PlayerView, TVView } from './GameViews.jsx'
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
          'game2_state',
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
        setGame({ ...result, receivedAt: Date.now() })
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
    await rpc('game2_command', {
      code_input: session.code,
      token_input: session.token,
      command_input: action,
      value_input: value,
    })
    await refresh()
  }
  async function vote(target) {
    await rpc('game2_vote', {
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
  async function chooseNight(target) {
    await rpc('game2_night_choice', {
      code_input: session.code,
      name_input: session.name,
      target_input: target,
    })
    await refresh()
  }
  async function lockNight() {
    await rpc('game2_night_lock', {
      code_input: session.code,
      name_input: session.name,
    })
    await refresh()
  }
  async function reveal() {
    await rpc('game2_reveal', {
      code_input: session.code,
      name_input: session.name,
    })
    await refresh()
  }
  if (session.kind === 'player')
    return (
      <PlayerView
        game={game}
        connection={connection}
        vote={vote}
        chooseNight={chooseNight}
        lockNight={lockNight}
        reveal={reveal}
        leave={leave}
      />
    )
  if (session.kind === 'tv')
    return <TVView game={game} session={session} connection={connection} />
  return <HostView game={game} connection={connection} command={command} />
}
