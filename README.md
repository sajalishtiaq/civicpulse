# CivicPulse

CivicPulse is a civic complaint reporting and triage platform. Citizens submit free-text complaints about local issues (water, electricity, roads, etc.), the backend automatically classifies each one by **category** and **priority** and writes a short summary, and staff manage complaints through a dashboard with a controlled status workflow.

Triage runs through a pluggable provider layer: an LLM (Groq) for classification, with a deterministic rule-based fallback so a complaint is never lost if the LLM is down or returns garbage.

## Features

- **Automatic triage** of every complaint (category, priority, 140-char summary, confidence)
- **Pluggable triage providers** with automatic fallback to rules on any failure
- **Prompt-injection resistant**: complaint text is treated as untrusted data, and output is validated against strict enums
- **Status workflow** enforced server-side (invalid transitions return `409`)
- **Redis-backed rate limiting** on complaint submission (10 requests/min per IP)
- **Redis-cached stats** endpoint (30s TTL, `X-Cache: HIT|MISS` header, invalidated on new complaints)
- **Structured JSON logs** with `X-Request-ID` correlation
- **Health and readiness probes** (`/health`, `/ready`)
- **Deployable via Docker Compose or Kubernetes** (Kustomize base + dev/prod overlays, HPA, VPA, PDB)
- **k6 load test** for the stats endpoint

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Cache / rate limit | Redis 7 |
| LLM triage | Groq API (default model `openai/gpt-oss-20b`) |
| Frontend | React 19, TypeScript, Vite, React Router, Axios |
| Serving | Nginx (frontend + `/api` reverse proxy) |
| Infra | Docker, Docker Compose, Kubernetes (Kustomize, Traefik ingress) |
| Testing | pytest, k6 |

## Project Structure

```
civicpulse/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, CORS, request-ID logging
│   │   ├── config.py                # Env-based settings
│   │   ├── models.py                # Complaint model + enums
│   │   ├── schemas.py               # Pydantic request/response schemas
│   │   ├── rate_limiter.py          # Redis rate limiter
│   │   ├── routes/                  # complaints, stats, health, meta
│   │   ├── services/                # Business logic (status transitions)
│   │   ├── repositories/            # DB access
│   │   └── providers/triage/        # rules, llm, simulated, factory (+ fallback)
│   ├── alembic/                     # DB migrations
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   ├── src/pages/                   # SubmitPage, DashboardPage, StatsPage
│   ├── nginx.conf
│   ├── docker-entrypoint.sh         # Writes runtime config.js from env
│   └── Dockerfile
├── k8s/
│   ├── base/                        # Deployments, StatefulSet, Ingress, HPA, VPA, PDB
│   └── overlays/{dev,prod}/
├── load/k6-script.js
├── compose.yaml                     # Local dev stack
└── compose.prod.yaml                # Prod-style stack (prebuilt images, resource limits)
```

## Getting Started

### Option 1: Docker Compose (recommended)

1. Create a `.env` file in the project root:

   ```env
   POSTGRES_USER=civicpulse
   POSTGRES_PASSWORD=devpassword
   POSTGRES_DB=civicpulse
   TRIAGE_PROVIDER=rules
   GROQ_API_KEY=
   GROQ_MODEL=openai/gpt-oss-20b
   ```

   `TRIAGE_PROVIDER=rules` works with no API key. Set it to `llm` and add a `GROQ_API_KEY` to use the LLM.

2. Start the stack:

   ```bash
   docker compose up --build
   ```

3. Run the database migrations (first run only):

   ```bash
   docker compose exec backend alembic upgrade head
   ```

4. Open the app at **http://localhost:5173**. The API is reachable through the frontend proxy at `http://localhost:5173/api/...`.

The backend container mounts `./backend/app` and runs with `--reload`, so code changes apply instantly. Postgres and Redis sit on an internal-only network and are not exposed to the host.

### Option 2: Run locally without Docker

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit DATABASE_URL / REDIS_URL for localhost
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

You need Postgres and Redis running locally. Note that `.env.example` defaults `REDIS_URL` to the Docker hostname `redis`, so change it to `redis://localhost:6379/0` when running outside Docker.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on http://localhost:5173 and talks to the API at `http://localhost:8000` (the only origin allowed by CORS by default).

## Configuration

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy Postgres URL (`postgresql+psycopg://...`) | (required) |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `TRIAGE_PROVIDER` | `rules`, `llm`, `simulated`, `always_fails`, `always_malformed` | `rules` |
| `GROQ_API_KEY` | Groq API key (only for `llm`) | empty |
| `GROQ_MODEL` | Groq model name | empty |

The frontend reads `API_BASE_URL` at container start (via `docker-entrypoint.sh`, which generates `config.js`), so one image works across environments. Leave it empty to use same-origin `/api` through Nginx.

## Triage Providers

| Provider | Purpose |
|---|---|
| `rules` | Keyword-based classifier. No network, always available. |
| `llm` | Groq LLM classifier. JSON-mode output validated against `TriageResult`. |
| `simulated` | Deterministic fake for CI. |
| `always_fails` / `always_malformed` | Test doubles that prove the fallback path works. |

**Fallback behavior:** any exception or invalid output from the active provider triggers `RuleBasedTriage`, and the complaint is stored with `triaged_by = "rules:fallback"`. The LLM provider has a 10s timeout, retries once with jittered backoff on transient errors, and does not retry on malformed output.

**Prompt injection:** the system prompt marks complaint text as untrusted data, and output must validate against the category/priority enums, so a citizen cannot dictate the classification through the complaint text.

## API

Base path: `/api`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/complaints` | Submit a complaint (triaged automatically). Rate limited. |
| `GET` | `/api/complaints` | List complaints. Filters: `category`, `priority`, `status`. Paging: `page`, `page_size` (max 100). |
| `GET` | `/api/complaints/{id}` | Get one complaint |
| `PATCH` | `/api/complaints/{id}/status` | Move a complaint to a new status |
| `GET` | `/api/stats` | Counts by category and priority (cached) |
| `GET` | `/api/meta/providers` | Active triage provider |
| `GET` | `/health` | Liveness |
| `GET` | `/ready` | Readiness (checks DB) |

FastAPI's interactive docs are available at `/docs` when running the backend directly.

**Create a complaint**

```bash
curl -X POST http://localhost:5173/api/complaints \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Burst water main is flooding the street, urgent!",
    "location": "Street 12, Sector F-7",
    "reporter_contact": "optional@example.com"
  }'
```

Validation: `text` is 10-2000 chars, `location` is 3-200 chars, `reporter_contact` is optional. Exceeding the rate limit returns `429` with a `Retry-After` header.

**Categories:** `water`, `electricity`, `sanitation`, `roads`, `streetlights`, `other`
**Priorities:** `high`, `normal`, `low`

### Status workflow

```
open ──► in_progress ──► resolved
  │            │
  └──► rejected ◄┘
```

`resolved` and `rejected` are terminal. Any other transition returns `409 Conflict`.

## Testing

```bash
cd backend
pytest
```

Current tests cover the LLM-to-rules fallback (provider failure and malformed output) and prompt-injection resistance.

**Load test** (requires [k6](https://k6.io)). Ramps to 100 virtual users against `/api/stats` to exercise the cache and autoscaling:

```bash
k6 run load/k6-script.js
```

The script targets `http://localhost/api/stats`, so edit the URL to match your environment.

## Deployment

### Docker Compose (production-style)

`compose.prod.yaml` uses prebuilt images from GHCR with CPU/memory limits and serves the frontend on port 80.

```bash
IMAGE_TAG=v1.0.0 docker compose -f compose.prod.yaml up -d
```

Replace `ghcr.io/yourusername/...` in `compose.prod.yaml` and `k8s/overlays/prod/kustomization.yaml` with your own registry path.

### Kubernetes

Manifests use Kustomize with a shared base and per-environment overlays.

- **Base:** namespace, ConfigMap, Postgres StatefulSet (1Gi PVC), Redis, backend and frontend Deployments, Traefik Ingress (`/api` to backend, `/` to frontend)
- **Backend resilience:** rolling updates with zero unavailable pods, HPA (2-10 replicas at 60% CPU), VPA in recommendation-only mode, PodDisruptionBudget (`minAvailable: 1`)

Secrets are not committed. Create `k8s/overlays/dev/secret.local.yaml` (gitignored) based on `k8s/base/secret.yaml`, setting `POSTGRES_PASSWORD` and `GROQ_API_KEY`, then:

```bash
kubectl apply -k k8s/overlays/dev
```

For prod, set image names and tags in `k8s/overlays/prod/kustomization.yaml` and provide the secret out-of-band.

