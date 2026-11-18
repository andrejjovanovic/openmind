# OpenMind

An open-source, self-hosted take on [mymind](https://mymind.com): one private
place for notes, links and images, with no folders to maintain. Everything
lives on your machine in a SQLite file and a folder of images.

OpenMind is an independent project and is not affiliated with mymind.

## What it does

- **Save anything quickly.** Type a note in the first card, paste a link, or
  paste / drop images anywhere on the page.
- **Links become visual cards.** The page title, description, site name and
  preview image are fetched and stored locally.
- **Search everything.** Full-text search (SQLite FTS5) over titles, note text,
  descriptions, tags and your own annotations, as you type.
- **Search by colour.** Each image's dominant colour is extracted on save.
- **Tags without filing.** Add or remove tags on any card; the most used ones
  appear as filters.
- **Optional AI tagging.** With an Anthropic API key, Claude writes a title, a
  one-line summary and tags for each save, and looks at images so they become
  searchable by what is in them.
- **Colour pins.** Pin any of the twelve colours on a card by hand, including
  notes and links, then filter by it.
- **Multiple brains.** Keep separate libraries (say, "Work" and "Recipes"),
  switch between them from the top bar, and move cards across.
- **Accounts.** Each person signs up with an email and password and sees only
  their own brains.
- **Serendipity.** Shuffle your mind to rediscover old saves.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

For a production build: `npm run build && npm start`.

Configuration is optional; copy `.env.example` to `.env.local` to change it.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Turns on AI titles, summaries and tags |
| `OPENMIND_AI_MODEL` | Model for tagging (default `claude-opus-5-5`; `claude-haiku-5-5` is far cheaper) |
| `OPENMIND_DATA_DIR` | Where the database and images are stored (default `./data`) |
| `OPENMIND_ALLOW_PRIVATE_URLS` | Allow saving links to private/loopback addresses |
| `OPENMIND_DISABLE_SIGNUP` | Set to `1` to stop new accounts being created (the first account can always be created) |

Back up by copying the data directory.

## Docker

```bash
docker build -t openmind .
docker run -d -p 3000:3000 -v openmind-data:/data openmind
```

Everything OpenMind stores is under `/data`; keep that volume. Pass
configuration with `-e` or `--env-file`. The container runs as a non-root user
and answers a health probe at `/api/health`.

`.github/workflows/docker.yml` builds the image on every pull request and
publishes it to `ghcr.io/<owner>/<repo>` for amd64 and arm64: pushes to `main`
are tagged `main` and `sha-<commit>`, and a git tag such as `v0.1.0` is
published as `0.1.0`, `0.1` and `latest`.

## Kubernetes

A Helm chart lives in `charts/openmind`:

```bash
helm install openmind ./charts/openmind \
  --set image.repository=ghcr.io/<owner>/<repo> \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=mind.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix \
  --set openmind.url=https://mind.example.com
```

See `charts/openmind/values.yaml` for the settings, including single sign-on
(`oidc.*`), AI tagging (`ai.*`) and `existingSecret` for keeping secrets out of
your values. Things to know:

- The image tag defaults to the chart's `appVersion`, so either publish that
  version tag first or set `image.tag` (for example `main`).
- OpenMind stores its data in one SQLite file, so the chart always runs a
  single pod and replaces it rather than rolling. It cannot be scaled out.
- Data is kept on a 5Gi PersistentVolumeClaim, which is left in place when the
  release is uninstalled.

## Accounts and security

The first visit asks you to create an account. Anyone who can reach the
instance can sign up unless `OPENMIND_DISABLE_SIGNUP=1` is set, so set it once
your people have accounts if the instance is reachable by others.

Passwords are hashed with scrypt and sessions are stored server-side. There is
no password reset, email verification or login rate limiting yet, so put
OpenMind behind HTTPS and a reverse proxy with rate limiting before exposing it
to the internet.

Cards saved before accounts existed are given to the first account created.

### Single sign-on (Pocket ID and other OpenID Connect providers)

1. In Pocket ID, create an OIDC client for OpenMind with the callback URL
   `https://your-openmind-host/auth/callback` and copy its client ID and secret.
2. Set these and restart:

   ```bash
   OIDC_ISSUER=https://id.example.com      # your Pocket ID address
   OIDC_CLIENT_ID=...
   OIDC_CLIENT_SECRET=...                  # omit for a public client
   OIDC_NAME="Pocket ID"                   # button label
   OPENMIND_URL=https://mind.example.com   # where people reach OpenMind
   ```

The login page then shows "Continue with Pocket ID". Signing in that way with
the email of an existing password account attaches to that account, provided
the provider reports the address as verified (`OIDC_TRUST_UNVERIFIED_EMAIL=1`
lifts that requirement); otherwise a new account is created. Who may sign in is
decided by the provider, so `OPENMIND_DISABLE_SIGNUP` does not apply to SSO.
Set `OPENMIND_DISABLE_PASSWORD_LOGIN=1` to make SSO the only way in.

## How it is built

- Next.js (App Router, Server Actions) and React, styled with Tailwind CSS
- SQLite through `better-sqlite3`, with an FTS5 index for search
- `sharp` for image normalisation and colour extraction, `cheerio` for link metadata

```
src/lib/db.ts        schema and queries
src/lib/ingest.ts    turning text, links and images into cards
src/lib/ai.ts        optional Claude tagging
src/lib/auth.ts      password hashing and sessions
src/lib/sso.ts       OpenID Connect sign-in
src/app/actions.ts   mutations
src/components/      grid, composer, card and focus view
```

## Not yet

Sharing a brain between accounts, password reset, browser extension and mobile
share target, article reader view, PDF and video cards.

## License

MIT
