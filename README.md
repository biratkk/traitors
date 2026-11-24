# The Traitors Dashboard

![The host dashboard with game controls and sample players](docs/home.png)

A control room for a weekend of suspicion, secrets, and suspiciously well-timed sound effects.

This is a tablet-first dashboard for the host of a Traitors-style party game. The host runs the show, but does not play. For now, the app is a single-device prototype. Bring your own accusations.

## Get started

Use Node.js 20.19+ or 22.12+. Vite 8 requires one of these versions.

```bash
npm install
npm run dev
```

Open the local URL that Vite prints. The development server starts with eight sample players. A production build starts with an empty player list.

```bash
npm run build    # Build the app into dist/
npm run preview  # Serve the production build locally
npm run lint     # Run Oxlint
```

## How to host

1. Add players on the home screen.
2. Open Kill or Banish and select a player. Their status updates on the home screen.
3. Open Sounds to set the mood. Tap an effect to play it once. Hold it until the bar fills to loop it.
4. Tap a playing effect to fade it out. Use Stop all to stop every sound immediately.

You can play several effects at the same time. Connect the tablet to a speaker through its Bluetooth settings. The audio files are bundled with the app, so playback does not need a network connection after the files load.

## What is in the box?

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Views, player state, audio playback, and touch controls |
| `src/App.css` | Dashboard layout and styles |
| `src/sounds.json` | Sound effect labels and file paths |
| `public/sounds/` | Bundled audio and source credits |
| `GOAL.md` | The full game brief and planned flow |

The app uses React, Vite, and Lucide icons. Sound effects come from Mixkit. See `public/sounds/CREDITS.md` for the license link and credits.

## Still under the cloak

Player names and statuses live in memory and reset when the page reloads. Kill and banishment narration uses a placeholder tone. The Missions view is empty.

Phone joining, private roles, realtime sync, traitor voting, win checks, and personalized narration are planned but not connected. See `GOAL.md` for the full brief.
