# GHCR pull-only deployment

Production images are built on **GitHub Actions** and pushed to **GitHub Container
Registry (GHCR)**. The Alibaba ECS box only **pulls** images and restarts — it never builds.
This avoids the OOM / swap-thrash that on-box `docker build` caused on the 3.5 GB instance.

```
 git push / tag  ─►  GitHub Actions (release.yml)  ─►  ghcr.io/<owner>/aiwatch-{web,worker}
                                                                  │  (private images)
 operator on ECS ◄──────────── docker compose pull ◄─────────────┘
        │
        └─► scripts/deploy-prod.sh: pull → isolated migrate → up -d → health-check → prune
```

## Components

| File | Role |
|------|------|
| `.github/workflows/release.yml` | Builds `web` + `worker` images, tags `:latest`, `:sha-<commit>`, and `:vX.Y.Z` on tags, pushes to GHCR. |
| `docker-compose.prod.yml` | Production topology referencing GHCR images (no `build:`). db + rsshub from upstream images. web boot skips migrate. |
| `scripts/deploy-prod.sh` | Pull-only deploy run on the ECS box. |

GHCR packages are **private by default** when first published, regardless of repository
visibility. Visibility is managed **per package** (GitHub profile → Packages →
`aiwatch-web` / `aiwatch-worker` → Package settings → Change visibility). Leave them private
to keep the images private; the ECS box pulls them with a `read:packages` PAT (see below).

## Publishing images

- **On demand:** GitHub → Actions → *Release (build & push images)* → *Run workflow*.
- **On a version tag:** `git tag v1.2.0 && git push origin v1.2.0` also publishes `:v1.2.0`.

The workflow authenticates with the built-in `GITHUB_TOKEN` (`packages: write`); no secret
to manage on the build side.

## One-time ECS setup

1. **Create a pull token.** GitHub → Settings → Developer settings → Personal access tokens.
   A classic PAT with `read:packages`, or a fine-grained token with **Packages: Read-only**.
2. **Log the box into GHCR** (once; Docker persists it in `~/.docker/config.json`):
   ```bash
   echo "<PAT>" | docker login ghcr.io -u <github-username> --password-stdin
   ```
3. **Make sure the box has** `docker-compose.prod.yml`, `.env`, and `scripts/deploy-prod.sh`
   (already present under `/srv/aiwatch/current` from the existing checkout; a `git pull`
   refreshes them). `.env` must keep `DATABASE_SSL=disable`, `PUBLIC_BASE_URL` set to the
   canonical public origin, `TRUSTED_PROXY_HOPS` set to the real CDN/proxy hop count,
   `CSP_ENFORCE=1`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`
   (unless `LLM_PROVIDER` points at another keyed provider), `CONTRIBUTION_SALT`,
   `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `RSSHUB_BASE_URL=http://rsshub:1200`, etc.

## Deploying a release

From the checkout root on the ECS box:

```bash
# Recommended: pin the exact build (tag shown in the release workflow summary)
IMAGE_TAG=sha-<full-commit-sha> bash scripts/deploy-prod.sh

# Or take whatever is newest
bash scripts/deploy-prod.sh
```

The script: pulls `web`+`worker`, ensures `db` is healthy, runs an **isolated one-shot
migration** in a throwaway container (a bad migration aborts *before* the live stack is
touched), then `up -d`, waits for `HTTP 200` on `127.0.0.1:3000`, and prunes dangling images.

## Database safety

Normal deploys do **not** clear production data. `docker-compose.prod.yml` stores Postgres
data in the named Docker volume `aiwatch_pg`, and `scripts/deploy-prod.sh` only performs
`pull`, an isolated `bun run db:migrate`, and `up -d`. It does not run seed/reset scripts and
does not remove volumes.

Data is at risk only if an operator explicitly runs destructive commands such as
`docker compose down -v`, deletes the `aiwatch_pg` volume, changes the compose project/volume
name, restores an empty backup, or manually runs a destructive reset/seed workflow.

## RSSHub / X configuration

X/Twitter RSSHub sources require two layers:

- `RSSHUB_BASE_URL` is read by AIWatch. In the production compose network, use
  `RSSHUB_BASE_URL=http://rsshub:1200`.
- `TWITTER_AUTH_TOKEN` is passed to the RSSHub container so RSSHub can access X routes. It is
  an X/Twitter auth token for RSSHub, not a token AIWatch uses directly.

If `RSSHUB_BASE_URL` (or the legacy `RSSHUB_URL`) is empty, RSSHub sources fail closed and the
admin source status should show them as unavailable with the configuration error.

## Rollback

Re-run with the previous known-good tag:

```bash
IMAGE_TAG=sha-<previous-good-sha> bash scripts/deploy-prod.sh
```

Migrations are forward-only (drizzle). If a migration must be undone, restore the DB volume
from backup before rolling the image back.

## Notes

- `docker-compose.prod.yml` is **standalone** — do not layer it on `docker-compose.yml`.
  Local development still uses `docker compose up --build` with the build-based files.
- The project name is `aiwatch` (`docker compose -p aiwatch`), matching the existing
  containers (`aiwatch-web-1`, `aiwatch-worker-1`, `aiwatch-db-1`, `aiwatch-rsshub-1`).
- Postgres is not published to the host. Inspect with
  `docker exec aiwatch-db-1 psql -U aiwatch -d aiwatch`.
