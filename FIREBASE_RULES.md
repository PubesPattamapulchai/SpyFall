# Firebase Rules

SpyFall does not maintain its own Firebase Realtime Database rules.

The single source of truth is:

`PubesPattamapulchai/WereWolf-Board-Game/firebase.rules.json`

All three games use Firebase project `werewolf-board-game-9b361`.

For SpyFall-specific changes, update the shared rules there under the `spyfall` game type. Do not add a new `firebase.rules.json` copy to this repository.

Deployment is handled from the WereWolf-Board-Game repository.
