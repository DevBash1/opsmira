# Contributing to Opsmira

Thanks for helping. This guide covers setup, how to propose a change, and what we look for in a review.

## Before you start

- **Bugs and small fixes:** open a pull request straight away.
- **New features or anything that changes behavior:** open an issue first so we can agree on the shape
  before you spend time on it.
- **Security problems:** do not open an issue. See [SECURITY.md](SECURITY.md).

## Contributor agreement

Opsmira is licensed [AGPL-3.0-only](LICENSE). Before we merge pull requests from people outside the
maintainer team, contributors will be asked to accept a Contributor License Agreement (CLA) so the project can
offer a hosted service and commercial features. A bot will ask you to sign on your first pull request. Until
that is set up the repository is private and not taking outside contributions.

## Setup

```bash
git clone https://github.com/DevBash1/opsmira.git && cd opsmira
npm run setup
cp .env.example server/.env      # add an OPENROUTER_API_KEY
npm run dev                      # http://localhost:5173/app
```

Node 20+ (`.nvmrc` pins 22). The first start prints an admin password and saves it in `server/data/`.

## Layout

| Path | What |
|---|---|
| `src/` | React 19 + Tailwind v4 web app (marketing pages and the console at `/app`) |
| `src/components/console/` | Console UI: scenes, kit, live surfaces |
| `server/src/` | Express server, agent loop (`ai.js`), command runner (`exec.js`), collectors (`surfaces.js`) |
| `server/test/` | Server tests (`node --test`) |
| `docs/` | Architecture, self-hosting, plans |
| `deploy/` | systemd unit, reverse-proxy example |

See [docs/architecture.md](docs/architecture.md) for how the pieces talk to each other.

## Making a change

1. Fork, then branch from `main`: `git switch -c fix/short-name`.
2. Keep the change focused. One concern per pull request.
3. Run `npm run check` (typecheck and server tests) and `npm run build`. Add or update tests for server logic.
4. Update [CHANGELOG.md](CHANGELOG.md) under **Unreleased** for anything a user would notice.
5. Open a pull request using the template. Say what changed and how you checked it. Screenshots for UI changes.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `docs: …`,
`refactor: …`, `test: …`, `chore: …`. Squash-merging uses the pull request title, so make that one conventional too.

## Code style

- Match the surrounding code: naming, comment density, idiom. There is no formatter to fight; follow
  `.editorconfig` and keep diffs small.
- TypeScript strict in `src/`. Server code is plain ESM JavaScript.
- **No fake data.** A surface shows what the machine reports, or says it is unavailable and why. Never invent
  readings to fill a screen.
- Copy in the UI is plain and short. No em dashes.
- Anything that runs commands must go through `server/src/exec.js` (local) or `server/src/machine.js` (SSH).
  Do not spawn shells from other places.

## Releases

Maintainers cut releases: update `CHANGELOG.md` and the versions in both `package.json` files, then tag
`vX.Y.Z`. The release workflow builds the Docker image and creates the GitHub release.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
