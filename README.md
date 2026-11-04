# seng383-team-project

AI-assisted child development platform – SENG 383 term project, team **383-G9**
(Batın Abiş, Mert Akdemir, Burak Tunahan Mazman).

Parents, specialists and children share one weekly schedule, one task list and one record of observations. An AI module summarizes the week for each reader by role; it only makes suggestions, people decide.

Requirements: [`docs/SRS.md`](docs/SRS.md) · Project plan: [`docs/PMP.md`](docs/PMP.md) · Jira: TF383

## Requirements

- Node.js 22 or newer (comes with npm)
- Nothing else: the database is a local SQLite file and the AI runs in mock mode by default

## Getting started

```bash
npm install
cp server/.env.example server/.env    # on Windows: copy server\.env.example server\.env
npm run seed
npm run dev
```

Then open http://localhost:5173. The page should say "Sistem durumu: çalışıyor", show the number of seeded users and, under "Görevler", the sample task "20 dakika kitap oku" that the seed stored in the database. The API runs on http://localhost:3001.

### Demo accounts

`npm run seed` creates synthetic users only. The password is `Demo1234` for all of them.

| Email | Role |
|---|---|
| parent@demo.test | Parent of Can |
| child@demo.test | Child (Can) |
| teacher@demo.test | Specialist, linked to Can |
| psychologist@demo.test | Specialist, linked to Can |
| coach@demo.test | Specialist, **not** linked (for access tests) |

Running the seed again resets the database to this state.

## Tests

```bash
npm test             # backend (Jest + Supertest) and frontend (Vitest), with coverage
npx playwright install chromium   # only once
npm run test:e2e     # end-to-end (Playwright), starts the servers itself
```

CI (GitHub Actions) runs all of these on every pull request to `main`.

## AI module

All calls to the AI provider (GitHub Models) go through `server/src/ai/index.js`.

- `AI_MODE=mock` (default): returns a fixed summary, no network, no token needed. Tests and CI always use this.
- `AI_MODE=live`: set `GITHUB_TOKEN` (a GitHub token with access to GitHub Models) and optionally `AI_MODEL` in `server/.env`.

Never commit `server/.env`.

## Project structure

```
client/   React (Vite) frontend
server/   Express API, SQLite database, seed script, AI module
e2e/      Playwright end-to-end tests
docs/     SRS, PMP and other documents
```

## How we work

- Every piece of work has a Jira issue (TF383-…). Put the key in the branch name and commit message, e.g. `TF383-21-login-api` and `TF383-21 Add login endpoint`, so it shows up in Jira.
- No direct pushes to `main`: open a pull request, get a review from a teammate and wait for CI to pass before merging.
