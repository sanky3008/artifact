# Artifact

A tiny self-hosted file sharing app for HTML prototypes. Upload `.html` files, organise them into folders, and share a clean public link — no accounts, no analytics, no third parties.

Built as a lightweight alternative to dropping prototypes into Vercel/Netlify when all you want is a stable URL to send someone.

## How it works

- **Admin side** (password-gated): browse, upload, rename, move, and delete HTML files in a folder tree. Folder and file views are bookmarkable (`/browse/<folder>?f=<file>.html`) and the browser back button works.
- **Public side** (no auth): anyone with a link to `/v/<path>/<file>.html` can view the file. Folder listings and the admin UI stay private. Shared documents are served with a CSP sandbox so they can't act on the app with a viewer's session.
- **MCP side**: Claude (or any MCP client) can manage documents at `/mcp` — including surgical edits (`edit_file`), chunked writes for large documents (`append_file`), and reading a document from its share link (`read_file_from_url`).

## Stack

- **Backend** — FastAPI (Python 3.12), session cookies in-memory, files on disk
- **Frontend** — React + TypeScript + Vite
- **Deploy** — single Docker image, multi-stage build

## Run it

### Docker (recommended)

```bash
ARTIFACT_PASSWORD=your-password docker compose up --build
```

App is at `http://localhost:3000`. Uploads persist to `./data`.

### Local dev

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ARTIFACT_PASSWORD` | `artifact` | Admin login password |
| `ARTIFACT_UPLOAD_DIR` | `backend/uploads` | Where uploaded files live |
| `ARTIFACT_FRONTEND_DIR` | `frontend/dist` | Built frontend assets to serve |
| `ARTIFACT_AUTH_MODE` | `password` | Auth mode: `password` or `google` |
| `GOOGLE_CLIENT_ID` | — | Google OAuth 2.0 Client ID (required when mode=`google`) |
| `ARTIFACT_ALLOWED_DOMAIN` | — | Allowed email domain, e.g. `mycompany.com` (required when mode=`google`) |
| `ARTIFACT_MCP_TOKEN` | — | Bearer token protecting `/mcp` in password mode. **Set this** — without it (and without Google OAuth) the MCP endpoint is open to anyone who can reach the host |

Uploads are capped at 10MB per file and restricted to `.html`.

### MCP (Claude integration)

The MCP endpoint lives at `/mcp` (streamable HTTP). In password mode, set `ARTIFACT_MCP_TOKEN` and configure your MCP client with an `Authorization: Bearer <token>` header. With Google OAuth configured, `/mcp` uses OAuth instead.

Tools: `list_files`, `get_file_tree`, `read_file`, `read_file_from_url` (reads a `/v/...` share link), `create_file`, `update_file`, `edit_file` (exact string replacement — no need to resend the whole document), `append_file` (build large documents in chunks), `delete_file`, `create_folder`, `delete_folder`, `rename`, `move`.

### Google Sign-In (domain-restricted access)

To lock the entire app behind Google Sign-In so only users with a specific email domain can access it:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and create an **OAuth 2.0 Client ID** (type: Web application). Add your deployment URL (e.g. `http://localhost:3000`) to **Authorized JavaScript origins**.
2. Set the environment variables:

```bash
ARTIFACT_AUTH_MODE=google \
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com \
ARTIFACT_ALLOWED_DOMAIN=mycompany.com \
docker compose up --build
```

When enabled, all routes — including file browsing and public `/v/` links — require authentication. Only `@mycompany.com` Google accounts can sign in. Password login is disabled.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Exchange password for a session cookie |
| `POST` | `/api/auth/logout` | — | Clear session |
| `GET` | `/api/auth/status` | — | Check session |
| `POST` | `/api/auth/google` | — | Exchange Google ID token for session (google mode) |
| `GET` | `/api/files?path=/x` | ✓ | List folder contents |
| `GET` | `/api/tree` | ✓ | Full folder tree |
| `POST` | `/api/files/upload` | ✓ | Upload `.html` files |
| `POST` | `/api/folders` | ✓ | Create folder |
| `POST` | `/api/files/rename` | ✓ | Rename file or folder |
| `POST` | `/api/files/move` | ✓ | Move file or folder |
| `DELETE` | `/api/files` | ✓ | Delete file or folder |
| `GET` | `/v/<path>` | google | Public render of an HTML file |

## Layout

```
backend/        FastAPI app (single file)
frontend/       React + Vite UI
project/        Original HTML/JSX design prototypes (kept for reference)
chats/          Design handoff transcripts
Dockerfile      Multi-stage build
docker-compose.yml
```

## Tests & CI

```bash
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
pytest backend/tests
ruff check backend
```

GitHub Actions runs the backend tests + ruff and the frontend type-check/build on every push and PR (`.github/workflows/ci.yml`).

## Notes

- Session tokens are in-memory — restarting the server logs everyone out.
- Path traversal is blocked at the API layer (`resolve_path`) and the static-file catch-all.
- Shared `/v/` documents are served with `Content-Security-Policy: sandbox allow-scripts`: scripts run, but in an opaque origin (no cookies, no `localStorage`, no same-origin API calls). Remove that header in `backend/main.py` if a document legitimately needs those.
