# ⚔️ Quest Log — Gamified Todo

A small todo app that turns tasks into XP. React (Vite) front end, Node.js/Express API,
SQLite storage. Built to be hosted on **IIS under the `/UBMV` application**, with IIS (ARR) reverse-proxying
to Node running as a Windows service.

## Game rules

| Mechanic      | How it works |
|---------------|--------------|
| XP            | Easy **+10**, Medium **+25**, Hard **+50** per completed task |
| Streak bonus  | Completing tasks on consecutive days adds **+10% XP per day**, up to **+50%** |
| Levels        | Level 2 at 100 XP, 3 at 300, 4 at 600, 5 at 1000 … (`50 × L × (L−1)`) with titles Rookie → Legend |
| Achievements  | 8 badges: first task, 10/50 tasks, 5 hard tasks, 3/7-day streak, level 5, clear a board of 5+ |
| Undo          | Re-opening a task removes exactly the XP it earned (streaks and badges are kept) |

## Project layout

Client and server are built and deployed independently — there is no combined output folder.

```
gamified-todo/
├── client/                 React UI (Vite), base path /UBMV/
│   ├── public/web.config   IIS rules: proxy /api → Node, SPA fallback, caching
│   ├── src/                App.jsx, api.js, components/, styles.css
│   ├── vite.config.js      base path + dev proxy for /UBMV/api → 127.0.0.1:3001
│   └── dist/               ← `npm run build` output = the IIS folder (index.html, assets/, web.config)
├── server/                 Node API (no build step), mounted on /UBMV/api
│   ├── server.js           entry point, listens on 127.0.0.1:3001
│   └── src/                api.js (routes), db.js (SQLite), gamification.js
├── DEPLOYMENT.md           step-by-step IIS + ARR guide
└── package.json            convenience scripts for both halves
```

## Run locally

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`; nothing native to compile).

```bash
npm run install:all
npm run dev:server        # API on http://127.0.0.1:3001/UBMV/api
npm run dev:client        # UI  on http://localhost:5173/UBMV/  (proxies /UBMV/api to the API)
```

To try the production build of the UI against the API:

```bash
npm run build:client      # → client/dist
npm run preview:client    # http://localhost:4173/UBMV/  (same API proxy)
```

## API (all under `/UBMV/api`)

| Method | Route                       | Body / notes |
|--------|-----------------------------|--------------|
| GET    | `/health`                   | `{ status: "ok" }` |
| GET    | `/todos`                    | Open tasks first, newest first |
| POST   | `/todos`                    | `{ title, difficulty?: "easy"\|"medium"\|"hard", dueDate?: "YYYY-MM-DD" }` |
| PATCH  | `/todos/:id`                | Any of `title`, `difficulty`, `dueDate` (difficulty is locked once completed) |
| DELETE | `/todos/:id`                | 204 |
| POST   | `/todos/:id/complete`       | Returns `{ todo, xpGained, leveledUp, newAchievements, profile }` |
| POST   | `/todos/:id/uncomplete`     | Returns `{ todo, xpLost, profile }` |
| GET    | `/profile`                  | XP, level, progress, streaks, achievements |

## Deploy

See **[DEPLOYMENT.md](DEPLOYMENT.md)**. Short version:

- **UI:** `npm run build` in `client/`, copy the contents of `client/dist` to
  `C:\inetpub\wwwroot\UBMV`, and make that folder an IIS application named `UBMV`.
- **API:** copy `server/` to `C:\Apps\UBMV-api`, run `npm ci --omit=dev`, and run `server.js`
  as a Windows service (NSSM) on `127.0.0.1:3001`.
- IIS (URL Rewrite + ARR) serves the UI itself and proxies only `/UBMV/api/*` to the API.

This is a single-user app with no authentication — put it behind Windows Authentication in IIS
if it shouldn't be public.
