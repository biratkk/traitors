# Glossary

This glossary defines terms used in the dashboard and the game brief. Planned features are marked as planned.

## People and roles

| Term | Meaning |
| --- | --- |
| Host | The person who runs the dashboard. The host does not play. |
| Player | A person taking part in the game. |
| Faithful | A player whose goal is to remove the traitors. Roles are assigned when the host starts the game. |
| Traitor | A player who secretly works against the faithfuls. Roles are assigned when the host starts the game. |

## Game actions and states

| Term | Meaning |
| --- | --- |
| Alive | A player who is still in the game. |
| Kill | Mark a player as killed. Traitors choose a victim at night. |
| Killed | The status of a player marked out through Kill. |
| Banish | Mark a player as banished after an out-loud vote. |
| Banished | The status of a player marked out through Banish. |
| Round table | The discussion and out-loud vote where players choose someone to banish. |
| Start of day | The sound played to begin the day. |
| Night falls | The sound played to begin the night. |
| Mission | A future game activity. The Missions view is currently empty. |
| Finale | The planned end of the game after a win check. |

## App and audio

| Term | Meaning |
| --- | --- |
| Dashboard | The host screen with game controls and player statuses. |
| Sound effect | A bundled audio clip that the host can play from Sounds. |
| Loop | Repeat a sound effect until the host stops it. |
| Narration | A spoken game line. Player-specific narration is currently a placeholder tone. |
| Room code | The code displayed on the TV that lets the host and players join a game. |
| Realtime sync | The service that shares game state across devices. The app currently checks Supabase for updates every two seconds. |
| Web app | The site installed on a device's home screen. |
| End-to-end test | A test that uses a browser to exercise the app. |
