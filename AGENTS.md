# AGENTS.md

## Architecture

Three independent apps sharing one monorepo:

| Part | Path | Stack |
|---|---|---|
| API backend | `services/api/` | FastAPI, Python 3.13, async SQLAlchemy + asyncpg, Alembic, PostgreSQL 16 |
| Web frontend | `services/web/` | Next.js 15 (App Router, static export), React 19, Tailwind CSS, TypeScript |
| Mobile app | `mobile/` | React Native 0.74, Expo SDK 51, TypeScript |

Shared upload storage lives at `services/cloud/uploads/` (not gitignored content; the path is mounted in Docker and configured via `UPLOAD_DIR` in the API `.env`).

Infra: `infra/docker-compose.yml` orchestrates all services (Postgres, API, web, backup). Reverse-proxy example at `infra/nginx.example.conf`.

## API — key commands

```bash
cd services/api
uv venv
uv pip install -r requirements.txt
cp .env.example .env        # if .env.example exists; otherwise use the existing .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

- Package manager is **uv** (not pip directly). `requirements.txt` is the source of truth for pinned deps; root `pyproject.toml` is workspace-level only.
- Config is via `pydantic-settings` reading `services/api/.env` (not root `.env`).
- `JWT_SECRET` must be ≥32 chars or the app refuses to start.
- `IS_PRODUCTION=true` rejects any `http://` or `localhost` in `CORS_ORIGINS` — don't set it in local dev.
- The `UPLOAD_DIR` in `services/api/.env` is a **relative path** (`../../services/cloud/uploads`) that resolves to the shared volume.

## API — Alembic migrations

Alembic runs from `services/api/` with `alembic.ini` in that directory. The `env.py` converts `DATABASE_URL` from asyncpg to psycopg2 format automatically.

**History has merge heads** (files like `016_merge_notes_invites_heads.py`, two `010_*`, two `025_*`, two `026_*`). Always run `alembic upgrade heads` (plural), not `alembic upgrade head`.

Create new migrations:
```bash
cd services/api
uv run alembic revision -m "description"
```

## API — tests

Tests require a **live PostgreSQL** instance (no SQLite, no mocking). The conftest creates/drops a `lentik_test` database per session. Each test runs in an outer transaction that rolls back.

```bash
cd services/api
uv run pytest                  # all tests
uv run pytest tests/test_auth_token_storage.py  # single file
uv run pytest -k "test_name"   # single test by name
```

`asyncio_mode = auto` in `pytest.ini` — all async tests run automatically, no `@pytest.mark.asyncio` needed.

## Web frontend — key commands

```bash
cd services/web
npm install
npm run dev           # dev server on :3000
npm run build         # static export to out/
```

- No lint/typecheck scripts in `package.json`. Type-check manually: `npx tsc --noEmit`.
- `API_URL` is NOT used at runtime for the web client — `src/lib/api-base.ts` derives the API base from `window.location` (same hostname, port 8000). `NEXT_PUBLIC_API_BASE` / `NEXT_PUBLIC_WS_BASE` env vars override this for Docker builds.
- Output is `static export` — no SSR, no `next start`. Production serves `out/` via `serve -s out -l 3000`.
- Auth uses httpOnly cookie `lentik_token` with `credentials: "include"` on all fetches.
- WebSocket connects directly to the API (port 8000), not through Next.js.

## Mobile app

```bash
cd mobile
npm install
npm start              # Expo dev server
npx expo run:android   # dev build on device/emulator
```

- `src/config.js` holds `API_BASE_URL` (not env vars). Phone must be on same Wi-Fi as dev machine — use LAN IP, not `localhost`.
- **Do NOT run `npm audit fix --force`** — it upgrades Expo SDK 51→56 and breaks the build. The audit advisories are dev-only and don't affect the shipped APK.
- Expo SDK upgrade must be incremental: 51→52→53, testing on device after each step.

## Design system (web)

`services/web/DESIGN.md` is the source of truth. Key rules:

- All colors, radii, shadows, animations must use CSS tokens from `src/styles/tokens.css`, not hardcoded Tailwind palette classes.
- **Status colors** (danger/success/warning): use `var(--danger-fg-bold)` etc., never `text-red-600` or `bg-emerald-500` — those don't theme.
- Button classes: `ui-btn`, `ui-btn-primary`, `ui-btn-subtle`, `ui-btn-danger`, `ui-btn-icon`. Deprecated (don't use in new code): `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `glass-button`.
- Modals: use the shared `Modal` component (`src/components/Modal.tsx`), don't hand-roll `fixed inset-0` overlays.
- Context menus: `ContextMenu` + `useContextMenu` hook.

## WebSocket

- Chat WS: `ws://host/families/{family_id}/chats/{chat_id}/ws`
- Presence WS: `ws://host/families/{family_id}/ws`
- Auth: httpOnly cookie automatically, OR one-time ticket from `POST /auth/ws-ticket` passed as `?ticket=` query param. Tickets are single-use, expire in 60s.
- Without valid auth, connection closes with code `4001`.
- Ping/pong: client sends `"ping"`, server replies `"pong"`.

## Conventions

- **Language**: READMEs, comments, and UI text are in Russian. Code identifiers are English.
- The `DEVELOPER_USERNAME` env var grants god-mode (bypasses all permissions) + `/admin` panel. Set at startup; flag is stored in DB as `is_developer` on the User model.
- Multi-instance scaling requires `REDIS_URL` (WS fan-out + shared rate-limiters) and `STORAGE_BACKEND=s3` (uploads). Without these, each instance is isolated.
- Backup service requires `BACKUP_ENCRYPTION_KEY` — it refuses to start without it (fail-fast, no unencrypted backups).
