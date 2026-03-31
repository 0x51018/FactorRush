# FactorRush

FactorRush is an invite-only party game prototype inspired by the room flow of Gartic Phone, but focused on fast number challenges instead of drawing prompts.

This first pass ships two rough game modes:

- `Prime Factor Sprint`: players race to break a target number into prime factors.
- `Decimal / Binary Blitz`: players race to convert decimal to binary or binary back to decimal.

There is no database, no login, and no public matchmaking. Rooms live entirely in server memory and are shared by link.

## Stack

- Monorepo with npm workspaces
- `apps/web`: Next.js App Router frontend
- `apps/server`: Express + Socket.IO realtime server
- `packages/shared`: shared types, challenge generation, validation, and scoring helpers

## Quick Start

```bash
npm install
npm run dev
```

That starts:

- the shared package in watch mode
- the realtime server on `http://localhost:3001`
- the web app on `http://localhost:3000`

## Build

```bash
npm run build
```

To run the production server after building:

```bash
npm run start --workspace @factorrush/server
npm run start --workspace @factorrush/web
```

In the current setup, the Next frontend and Socket.IO server run as separate processes.

## Dev Smoke Test

Run the dev servers first:

```bash
npm run dev
```

Then, in a second terminal:

```bash
npm run smoke:dev
```

The smoke test checks the realtime room flow:

- room creation
- player join
- game start
- correct answer submission
- round end

## Current Prototype Rules

- The host creates a room and shares the generated invite link.
- Anyone with the link can join by entering a nickname.
- The host chooses the mode, round count, and round timer in the lobby.
- Every round generates one challenge for the whole room.
- Correct answers score points, and earlier correct answers score more.
- When the timer ends, or all connected players answer correctly, the round reveals the answer.
- The host advances to the next round manually.

## Notes

- Room state is in-memory only, so rooms disappear when the server restarts.
- Reconnect is supported in a rough way through local browser storage.
- The gameplay rules are intentionally modular so scoring, round flow, and challenge generation can be refined later.
- There is no Docker or container networking configured yet.
- By default, the frontend connects to the realtime server at `http://localhost:3001`.
- You can override the frontend target with `NEXT_PUBLIC_SERVER_URL`.

## Korean Developer Docs

- Codebase guide: `docs/architecture-ko.md`
- Socket API spec: `docs/socket-api-ko.md`
- Oracle/systemd deployment guide: `docs/deployment-github-actions-ko.md`
- Home server Docker deployment guide: `docs/deployment-home-server-ko.md`
