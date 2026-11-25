# The Traitors Dashboard

![The host dashboard with game controls and sample players](public/home.png)

A tablet dashboard for the host of a Traitors-style party game. The host runs the game but does not play. The TV creates a game. The host and players join using its room code. Bring your own accusations.

## Get started

Use Node.js 20.19 or later, or Node.js 22.12 or later. Vite 8 requires these versions.

```bash
npm install
npm run dev
```

Open the URL that Vite prints. Add Supabase configuration before starting a shared game. New games start with no players.

```bash
npm run build    # Build the app into dist/
npm run preview  # Serve the production build locally
npm run lint     # Run Oxlint
```

## Run the tests

The end-to-end tests exercise the dashboard in Chromium and shared games in Chromium and Firefox. The shared-game tests use the configured Supabase project and delete their test rooms. Install the browsers once, then run the suite.

```bash
npx playwright install chromium firefox
npm test
```

GitHub Actions runs lint and tests on pushes and pull requests. Multiplayer tests require the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` repository secrets. Tests skip shared games if these are unavailable. The Vercel deployment is separate from the GitHub Actions workflow.

## How to host

1. On the TV, choose TV and create a game. The TV displays the room code.
2. On the host device, choose Host and join with the code. Players choose Player and join with the code and their names.
3. The host assigns roles and starts a mission. Players can show or hide their roles on their phones.
4. The mission lasts five minutes. The host can skip it. When the mission ends, the host starts the five-minute round-table discussion.
5. Players vote on their phones. If the vote ties, each tied player gets one minute to speak, followed by a revote. Further ties repeat this process.
6. The chosen player stands and reads a private prompt on their phone. They reveal their role on the TV when ready.
7. Connect the host device to the speaker and choose "Let the night begin". Everyone puts on a blindfold. Once everyone is covered, traitors can uncover their eyes.
8. The traitors choose the same victim and lock in. They have 40 seconds to replace their blindfolds. The TV then announces the victim.
9. Start the next mission.

The host device plays the night sound mix, the knife sound, and the morning birds. Keep the host device awake and connected to the speaker. Browser and device audio settings can affect playback.

## Install on a tablet

Open the deployed site over HTTPS. In Firefox or Chrome on Android, open the browser menu and select "Install" or "Add to Home screen". On an iPad, open the site in Safari, tap Share, and select "Add to Home Screen".

Open the installed app once while online to cache the dashboard. The browser caches sound files as it requests them. Test each sound offline on the tablet before the game. A shared game needs a network connection. The app saves the current session on the device and reconnects when the network returns.

## Project files

| Path | Purpose |
| --- | --- |
| `src/Multiplayer.jsx` | Session entry, reconnect handling, and server requests |
| `src/GameViews.jsx` | Host, TV, and player screens |
| `src/useNightAudio.js` | Night sound mix and transitions |
| `src/App.jsx` | Legacy dashboard used by the v1 test build |
| `src/App.css` and `src/multiplayer.css` | Layout and styles |
| `src/sounds.json` | Sound effect labels and file paths |
| `public/sounds/` | Bundled audio and source credits |
| `tests/` | End-to-end tests |
| `docs/GLOSSARY.md` | Game and application terms |
| `docs/GOAL.md` | Original game brief and planned flow |

The app uses React, Vite, and Lucide icons. Sound effects come from Mixkit. See `public/sounds/CREDITS.md` for the license link and credits.

## Current limits

Game state is stored in Supabase. A player can reconnect with the room code and name. Anyone who knows both can impersonate that player and see their role. Use this only with people you trust. The host session is saved on its device. If the host clears its browser data, it cannot reclaim that host session.

The app checks for updates every two seconds. Timed phases advance when a device next requests game state. Night choices require unanimous agreement. There is no night timeout. Game sessions have no automatic expiration yet.

Mission content and automatic win checks are not implemented. Banishment uses a written prompt rather than recorded narration. The TV morning announcement is written text. See `docs/GOAL.md` for the original brief.

## Version 2 development

Version 2 uses a dedicated Supabase project for shared game state. Copy `.env.example` to `.env.local` and set the project URL and publishable key. Never put a service-role key in a `VITE_` variable. Apply the SQL migrations in `supabase/migrations/` to the dedicated project. The browser uses only the publishable key. Do not use an existing project with unrelated tables.
