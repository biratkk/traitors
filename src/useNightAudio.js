import { useEffect, useRef } from 'react'

const files = {
  wind: 'sounds/2658.wav',
  tension: 'sounds/667.wav',
  heartbeat: 'sounds/492.wav',
  knife: 'sounds/2152.mp3',
  birds: 'sounds/2472.wav',
}

export function useNightAudio(game) {
  const contextRef = useRef(null)
  const buffersRef = useRef(null)
  const mixRef = useRef([])
  const previousPhase = useRef(null)

  async function enable() {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext)
      throw new Error('This browser cannot play the night sounds.')
    const context = contextRef.current || new AudioContext()
    contextRef.current = context
    await context.resume()
    if (!buffersRef.current) {
      const entries = await Promise.all(
        Object.entries(files).map(async ([name, path]) => {
          const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
          if (!response.ok) throw new Error('Could not load the night sounds.')
          return [
            name,
            await context.decodeAudioData(await response.arrayBuffer()),
          ]
        }),
      )
      buffersRef.current = Object.fromEntries(entries)
    }
  }

  useEffect(() => {
    const context = contextRef.current
    const buffers = buffersRef.current
    const previous = previousPhase.current
    previousPhase.current = game.phase
    if (!context || !buffers) return

    function play(name, volume, loop = false) {
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffers[name]
      source.loop = loop
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(context.destination)
      if (!loop) {
        source.onended = () => {
          source.disconnect()
          gain.disconnect()
        }
      }
      source.start()
      return { source, gain, volume }
    }
    function stopMix() {
      for (const item of mixRef.current) {
        try {
          item.source.stop()
        } catch {
          /* The source already stopped. */
        }
        item.source.disconnect()
        item.gain.disconnect()
      }
      mixRef.current = []
    }

    if (game.phase === 'night' && mixRef.current.length === 0) {
      mixRef.current = [
        play('wind', 0.28, true),
        play('tension', 0.18, true),
        play('heartbeat', 0.12, true),
      ]
    } else if (game.phase === 'blindfold' && previous !== 'blindfold') {
      play('knife', 0.7)
      const seconds = Math.max(
        0,
        (Date.parse(game.phaseEndsAt) - Date.parse(game.serverTime)) / 1000,
      )
      const now = context.currentTime
      for (const item of mixRef.current) {
        item.gain.gain.cancelScheduledValues(now)
        item.gain.gain.setValueAtTime(item.volume, now)
        item.gain.gain.setValueAtTime(
          item.volume,
          now + Math.max(0, seconds - 5),
        )
        item.gain.gain.linearRampToValueAtTime(0, now + seconds)
      }
    } else if (game.phase === 'morning' && previous !== 'morning') {
      stopMix()
      play('birds', 0.6)
    } else if (!['night', 'blindfold'].includes(game.phase)) {
      stopMix()
    }
  }, [game.phase, game.phaseEndsAt, game.serverTime])

  useEffect(
    () => () => {
      for (const item of mixRef.current) {
        try {
          item.source.stop()
        } catch {
          /* The source already stopped. */
        }
      }
      mixRef.current = []
      contextRef.current?.close()
      contextRef.current = null
    },
    [],
  )

  return { enable }
}
