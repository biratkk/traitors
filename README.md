# The Traitors Dashboard

![The host dashboard with game controls and sample players](public/home.png)

A tablet dashboard for the host of a Traitors-style party game. The host runs the game but does not play. This version runs on one device. Bring your own accusations.

## Get started

Use Node.js 20.19 or later, or Node.js 22.12 or later. Vite 8 requires these versions.

```bash
npm install
npm run dev
```

Open the URL that Vite prints. The development server starts with eight sample players. A production build starts with an empty player list.

```bash
npm run build    # Build the app into dist/
npm run preview  # Serve the production build locally
npm run lint     # Run Oxlint
```

## Run the tests

The end-to-end tests open the production build in Chromium and exercise the dashboard. Install the browser once, then run the suite.

```bash
npx playwright install chromium
npm test
```

GitHub Actions runs the tests and lint on pushes and pull requests. The Vercel deployment is separate from the GitHub Actions workflow.

## How to host

1. Add players on the home screen.
2. Open Kill or Banish and select a player. Their status updates on the home screen.
3. Open Sounds. Tap an effect to play it once. Hold it until the bar fills to loop it.
4. Tap a playing effect to fade it out. Use Stop all to stop every sound immediately.

You can play several effects at the same time. Connect the tablet to a speaker through its Bluetooth settings. The app serves its sound files from the same site.

## Install on a tablet

Open the deployed site over HTTPS. In Firefox or Chrome on Android, open the browser menu and select "Install" or "Add to Home screen". On an iPad, open the site in Safari, tap Share, and select "Add to Home Screen".

Open the installed app once while online to cache the dashboard. The browser caches sound files as it requests them. Test each sound offline on the tablet before the game. The installed app still stores player state only in memory.

## Project files

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Views, player state, audio playback, and touch controls |
| `src/App.css` | Dashboard layout and styles |
| `src/sounds.json` | Sound effect labels and file paths |
| `public/sounds/` | Bundled audio and source credits |
| `tests/` | End-to-end tests |
| `docs/GLOSSARY.md` | Game and application terms |
| `docs/GOAL.md` | Original game brief and planned flow |

The app uses React, Vite, and Lucide icons. Sound effects come from Mixkit. See `public/sounds/CREDITS.md` for the license link and credits.

## Current limits

Player names and statuses live in memory and reset when the page reloads. Kill and banishment narration uses a placeholder tone. The Missions view is empty.

Phone joining, private roles, realtime sync, traitor voting, win checks, and personalized narration are planned but not connected. See `docs/GOAL.md` for the original brief.
