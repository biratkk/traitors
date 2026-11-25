import { useEffect, useRef, useState } from 'react'
import {
  Sun,
  Moon,
  Shield,
  Swords,
  Sparkles,
  Volume2,
  VolumeX,
  Plus,
  X,
  ArrowLeft,
  Repeat2,
} from 'lucide-react'
import soundFiles from './sounds.json'
import './App.css'

const initialPlayers = import.meta.env.DEV
  ? [
      'Alex',
      'Charlotte',
      'Daniel',
      'Emily',
      'James',
      'Olivia',
      'Sam',
      'Sophie',
    ].map((name) => ({ name, status: 'alive' }))
  : []
const sounds = Object.keys(soundFiles)
const transitionFiles = {
  'Start of day': '/sounds/2472.wav',
  'Night falls': '/sounds/2482.wav',
}

function App({ multiplayer = null }) {
  const [localPlayers, setPlayers] = useState(initialPlayers)
  const players = multiplayer ? multiplayer.game.players : localPlayers
  const [modal, setModal] = useState(null)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [playingEffects, setPlayingEffects] = useState([])
  const [loopingEffects, setLoopingEffects] = useState([])
  const [effectProgress, setEffectProgress] = useState({})
  const [view, setView] = useState('home')
  const [holding, setHolding] = useState('')
  const audioRef = useRef(null)
  const effectsRef = useRef(new Map())
  const fadingRef = useRef(new Set())
  const audioContextRef = useRef(null)
  const audioNodesRef = useRef(new WeakMap())
  const holdTimer = useRef(null)
  const heldLabel = useRef(null)
  const suppressClick = useRef(false)

  function stopNarration() {
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      if (audio.element) {
        audio.element.onended = null
        audio.element.pause()
        audio.element.currentTime = 0
      } else {
        audio.oscillator.onended = null
        try {
          audio.oscillator.stop()
        } catch {
          /* Already stopped. */
        }
        audio.ctx.close()
      }
    }
  }
  function stopEffect(label, fade = false) {
    const element = effectsRef.current.get(label)
    if (!element) return
    effectsRef.current.delete(label)
    element.onended = null
    setPlayingEffects((current) => current.filter((name) => name !== label))
    setLoopingEffects((current) => current.filter((name) => name !== label))
    if (!fade || element.paused || element.ended) {
      element.pause()
      element.currentTime = 0
      audioNodesRef.current.get(element)?.source.disconnect()
      return
    }
    const nodes = audioNodesRef.current.get(element)
    const fading = { element, timer: null, source: nodes?.source }
    fadingRef.current.add(fading)
    if (nodes) {
      const now = nodes.context.currentTime
      nodes.gain.gain.cancelScheduledValues(now)
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now)
      nodes.gain.gain.linearRampToValueAtTime(0, now + 1)
    }
    fading.timer = setTimeout(
      () => {
        element.pause()
        element.currentTime = 0
        fading.source?.disconnect()
        fadingRef.current.delete(fading)
      },
      nodes ? 1000 : 0,
    )
  }
  function stopAudio() {
    stopNarration()
    for (const label of effectsRef.current.keys()) stopEffect(label)
    for (const fading of fadingRef.current) {
      clearTimeout(fading.timer)
      fading.element.pause()
      fading.element.currentTime = 0
      fading.source?.disconnect()
    }
    fadingRef.current.clear()
  }
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current)
      for (const element of effectsRef.current.values()) {
        element.onended = null
        element.pause()
      }
      effectsRef.current.clear()
      for (const fading of fadingRef.current) {
        clearTimeout(fading.timer)
        fading.element.pause()
        fading.source?.disconnect()
      }
      fadingRef.current.clear()
      audioContextRef.current?.close()
      audioContextRef.current = null
      const audio = audioRef.current
      if (audio) {
        if (audio.element) {
          audio.element.onended = null
          audio.element.pause()
        } else {
          audio.oscillator.onended = null
          try {
            audio.oscillator.stop()
          } catch {
            /* Already stopped. */
          }
          audio.ctx.close()
        }
      }
    },
    [],
  )
  useEffect(() => {
    if (!playingEffects.length) return
    let frame
    function updateProgress() {
      const next = {}
      for (const [label, element] of effectsRef.current) {
        next[label] =
          Number.isFinite(element.duration) && element.duration > 0
            ? Math.min(element.currentTime / element.duration, 1)
            : 0
      }
      setEffectProgress(next)
      frame = requestAnimationFrame(updateProgress)
    }
    frame = requestAnimationFrame(updateProgress)
    return () => cancelAnimationFrame(frame)
  }, [playingEffects])
  function startHold(event, sound) {
    suppressClick.current = false
    if (event.button !== 0 || effectsRef.current.has(sound)) return
    clearTimeout(holdTimer.current)
    heldLabel.current = sound
    setHolding(sound)
    holdTimer.current = setTimeout(() => {
      if (heldLabel.current !== sound) return
      suppressClick.current = true
      heldLabel.current = null
      setHolding('')
      play(sound, true)
    }, 700)
  }
  function cancelHold() {
    clearTimeout(holdTimer.current)
    heldLabel.current = null
    setHolding('')
  }
  function clickEffect(sound) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    play(sound)
  }
  function play(label, repeat = false) {
    const soundFile = soundFiles[label] || transitionFiles[label]
    if (soundFile) {
      if (effectsRef.current.has(label)) {
        stopEffect(label, true)
        return
      }
      const element = new Audio(
        `${import.meta.env.BASE_URL}${soundFile.replace(/^\//, '')}`,
      )
      element.loop = repeat
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (AudioContext) {
          const context = audioContextRef.current || new AudioContext()
          audioContextRef.current = context
          const source = context.createMediaElementSource(element)
          const gain = context.createGain()
          source.connect(gain)
          gain.connect(context.destination)
          audioNodesRef.current.set(element, { context, source, gain })
          if (context.state === 'suspended') context.resume().catch(() => {})
        }
      } catch {
        /* Playback still works without a fade if Web Audio is unavailable. */
      }
      effectsRef.current.set(label, element)
      setPlayingEffects((current) => [...current, label])
      if (repeat) setLoopingEffects((current) => [...current, label])
      element.onended = () => {
        if (effectsRef.current.get(label) === element) stopEffect(label)
      }
      element.play().catch(() => {
        if (effectsRef.current.get(label) === element) {
          stopEffect(label)
          setNotice(`Couldn't play ${label}.`)
        }
      })
      return
    }
    stopNarration()
    setNotice(`Placeholder: ${label}`)
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        const ctx = new AudioContext(),
          oscillator = ctx.createOscillator(),
          gain = ctx.createGain()
        oscillator.frequency.value = 330
        gain.gain.setValueAtTime(0.04, ctx.currentTime)
        if (!repeat)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
        oscillator.connect(gain)
        gain.connect(ctx.destination)
        oscillator.start()
        audioRef.current = { ctx, oscillator }
        if (!repeat) oscillator.stop(ctx.currentTime + 0.5)
        oscillator.onended = () => {
          if (audioRef.current?.oscillator === oscillator) {
            audioRef.current = null
            ctx.close()
          }
        }
      }
    } catch {
      /* The visual placeholder remains available. */
    }
  }
  function addPlayer(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (
      !trimmed ||
      players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setNotice('Enter a unique player name.')
      return
    }
    setPlayers([...players, { name: trimmed, status: 'alive' }])
    setName('')
    setModal(null)
  }
  async function eliminatePlayer(player, status) {
    if (multiplayer) {
      try {
        await multiplayer.command(
          status === 'killed' ? 'kill' : 'banish',
          player.id,
        )
        play(`${status === 'banished' ? 'Banish' : 'Kill'} ${player.name}`)
      } catch (error) {
        setNotice(error.message)
      }
      return
    }
    setPlayers(
      players.map((p) => (p.name === player.name ? { ...p, status } : p)),
    )
    setModal(null)
    play(`${status === 'banished' ? 'Banish' : 'Kill'} ${player.name}`)
  }
  return (
    <main
      className={`dashboard ${view === 'sounds' ? 'sounds-view' : view === 'home' ? 'home-view' : ''}`}
    >
      {view === 'missions' ? (
        <>
          <button className="round-back" onClick={() => setView('home')}>
            <ArrowLeft size={20} /> Back
          </button>
        </>
      ) : view === 'banish' || view === 'kill' ? (
        <>
          <button className="round-back" onClick={() => setView('home')}>
            <ArrowLeft size={20} /> Back
          </button>
          <div className="round-players">
            {players.map((player, i) => (
              <button
                key={player.name}
                className={`round-player round-color-${i % 4}`}
                disabled={player.status !== 'alive'}
                onClick={() =>
                  eliminatePlayer(
                    player,
                    view === 'kill' ? 'killed' : 'banished',
                  )
                }
              >
                <span>{player.name}</span>
                {player.status !== 'alive' && (
                  <small className="round-status">
                    {player.status === 'banished' ? 'Banished' : 'Killed'}
                  </small>
                )}
              </button>
            ))}
          </div>
        </>
      ) : view === 'sounds' ? (
        <>
          <button className="round-back" onClick={() => setView('home')}>
            <ArrowLeft size={20} /> Back
          </button>
          <div className="sounds-layout">
            <div className="sounds-transitions">
              {[
                ['Start of day', Sun, 'morning'],
                ['Night falls', Moon, 'night'],
              ].map(([label, Icon, color]) => (
                <button
                  key={label}
                  className={`control transition-control ${color} ${playingEffects.includes(label) ? 'is-playing' : ''}`}
                  aria-pressed={playingEffects.includes(label)}
                  aria-label={`${label}${loopingEffects.includes(label) ? ', looping' : ''}`}
                  onPointerDown={(event) => startHold(event, label)}
                  onPointerUp={cancelHold}
                  onPointerCancel={cancelHold}
                  onPointerLeave={cancelHold}
                  onBlur={cancelHold}
                  onKeyDown={(event) => {
                    if (event.key === ' ' && !event.repeat) {
                      event.preventDefault()
                      startHold({ button: 0 }, label)
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === ' ') {
                      event.preventDefault()
                      cancelHold()
                      clickEffect(label)
                    }
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => clickEffect(label)}
                >
                  <Icon />
                  <span className="effect-label">
                    {label}
                    {loopingEffects.includes(label) && (
                      <Repeat2 size={20} aria-hidden="true" />
                    )}
                  </span>
                  {playingEffects.includes(label) && (
                    <span
                      className="playback-progress"
                      style={{
                        transform: `scaleX(${effectProgress[label] || 0})`,
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {holding === label && (
                    <span className="hold-progress" aria-hidden="true" />
                  )}
                </button>
              ))}
              <button
                className="control stop"
                onClick={() => {
                  stopAudio()
                  setNotice('Stopped')
                }}
              >
                <VolumeX />
                <span>Stop all</span>
              </button>
            </div>
            <div className="effects-grid">
              {sounds.map((sound) => (
                <button
                  key={sound}
                  aria-pressed={playingEffects.includes(sound)}
                  aria-label={`${sound}${loopingEffects.includes(sound) ? ', looping' : ''}`}
                  className={`effect-button ${playingEffects.includes(sound) ? 'is-playing' : ''}`}
                  onPointerDown={(event) => startHold(event, sound)}
                  onPointerUp={cancelHold}
                  onPointerCancel={cancelHold}
                  onPointerLeave={cancelHold}
                  onBlur={cancelHold}
                  onKeyDown={(event) => {
                    if (event.key === ' ' && !event.repeat) {
                      event.preventDefault()
                      startHold({ button: 0 }, sound)
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === ' ') {
                      event.preventDefault()
                      cancelHold()
                      clickEffect(sound)
                    }
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  onClick={() => clickEffect(sound)}
                >
                  <span className="effect-label">
                    {sound}
                    {loopingEffects.includes(sound) && (
                      <Repeat2 size={16} aria-hidden="true" />
                    )}
                  </span>
                  {playingEffects.includes(sound) && (
                    <span
                      className="playback-progress"
                      style={{
                        transform: `scaleX(${effectProgress[sound] || 0})`,
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {holding === sound && (
                    <span className="hold-progress" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {multiplayer ? (
            multiplayer.controls
          ) : (
            <button
              className="round-back add-player-top"
              onClick={() => setModal('add')}
            >
              <Plus size={20} /> Add player
            </button>
          )}
          <div className="home-content">
            <div className="controls">
              <button
                className="control kill-control"
                onClick={() => setView('kill')}
              >
                <Swords />
                <span>Kill</span>
              </button>
              <button
                className="control banish"
                onClick={() => setView('banish')}
              >
                <Shield />
                <span>Banish</span>
              </button>
              <button
                className="control night"
                onClick={() => setView('sounds')}
              >
                <Volume2 />
                <span>Sounds</span>
              </button>
              <button
                className="control mission-control"
                onClick={() => setView('missions')}
              >
                <Sparkles />
                <span>Missions</span>
              </button>
            </div>
            <div className="home-players">
              {players.map((player) => (
                <div key={player.name} className="home-player">
                  <span className="player-initial">
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="home-player-name">{player.name}</span>
                  {multiplayer && (
                    <small
                      className={
                        player.connected
                          ? 'connection-online'
                          : 'connection-offline'
                      }
                    >
                      {player.connected ? 'Connected' : 'Disconnected'}
                    </small>
                  )}
                  <small className={`status-${player.status}`}>
                    {player.status === 'alive'
                      ? 'Alive'
                      : player.status === 'banished'
                        ? 'Banished'
                        : 'Killed'}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {notice && (
        <button
          className="notice"
          onClick={() => setNotice('')}
          aria-label={`${notice}. Dismiss.`}
        >
          {notice}
          <X size={16} />
        </button>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="modal-title">Add player</h2>
              <button
                className="close"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                <X />
              </button>
            </div>
            <form onSubmit={addPlayer}>
              <input
                aria-label="Player name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                autoFocus
                placeholder="Player name"
              />
              <button className="confirm" type="submit">
                <Plus size={18} /> Add player
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
export default App
