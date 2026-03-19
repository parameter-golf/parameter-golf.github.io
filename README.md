# OpenAI Parameter Golf Leaderboard

An unofficial `openai/parameter-golf` leaderboard explorer and PR tracker designed for GitHub Pages.

The current official public leaderboard is the `Leaderboard` table in the upstream repository README:

- https://github.com/openai/parameter-golf#leaderboard

This project exists to make the public state easier to browse by combining three public sources into a static site:

- merged records from `main`
- active PR submissions that add `records/**/submission.json`
- closed PR submissions for historical context

## Why This Repo Exists

OpenAI's public challenge flow is PR-based. The official leaderboard is visible in the upstream README, while candidate submissions are spread across open PRs. This repo materializes both into static JSON and presents them in one place without needing a backend.

The site is intentionally framed as:

- unofficial
- source-linked
- transparent about status

That positioning is the most plausible path if you later ask upstream maintainers to link to it from docs or Discord.

## Architecture

The site is fully static.

- `scripts/collect.mjs`
  - fetches `openai/parameter-golf` metadata via the GitHub API
  - scans `main` for `records/**/submission.json`
  - scans PR changed files for `records/**/submission.json`
  - normalizes everything into static JSON under `docs/data/`
- `docs/`
  - GitHub Pages site
  - fetches `docs/data/submissions.json` and `docs/data/summary.json`
- `.github/workflows/refresh-data.yml`
  - scheduled data refresh
  - commits regenerated data back into this repo
- `.github/workflows/deploy-pages.yml`
  - deploys the static site to GitHub Pages

## Data Model

Each normalized submission entry includes:

- source type: `official` or `pull_request`
- lifecycle status: `official`, `open`, `merged`, or `closed`
- track classification
- author and GitHub identity
- raw metrics from `submission.json`
- links to upstream PR, README, train log, and submission JSON

See [docs/data-schema.md](/Users/taehoje/golf-viewer/docs/data-schema.md).

## Local Usage

Use a GitHub token if possible. Public unauthenticated rate limits are too small for repeated full refreshes.

```bash
export GITHUB_TOKEN=ghp_your_token_here
npm run collect
npm run dev
```

If you already use GitHub CLI locally, this is enough:

```bash
export GITHUB_TOKEN="$(gh auth token)"
npm run collect
```

Then open `http://localhost:4173`.

## Suggested Upstream Positioning

If you propose this tool upstream, keep the ask narrow:

1. Ask for it to be listed as an unofficial community explorer.
2. Do not ask maintainers to treat it as the official source of truth.
3. Point to the fact that it mirrors the README leaderboard and surfaces open PR submissions already visible on GitHub.

Prepared copy and placement ideas live in [docs/openai-link-proposal.md](/Users/taehoje/golf-viewer/docs/openai-link-proposal.md).
