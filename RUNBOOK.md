# CivicPulse Runbook

Operational guide for deploying, rolling back, reading logs, and handling triage failures.

**Owners:** Sajal Ishtiaq ([@sajalishtiaq](https://github.com/sajalishtiaq)) and Saliha Noor ([@Saliha-Noor](https://github.com/Saliha-Noor))

## 0. Quick reference

| Item | Value |
|---|---|
| Namespace | `civicpulse` |
| Workloads | `deployment/backend` (2 to 10 replicas via HPA), `deployment/frontend` (2), `statefulset/postgres` (pod `postgres-0`, PVC `pgdata`), `deployment/redis` (PVC `redis-data`) |
| Services | `backend:8000`, `frontend:80`, `postgres:5432` (headless), `redis:6379`, all ClusterIP |
| Ingress | `civicpulse-ingress`, class `traefik`; `/api` goes to `backend`, `/` goes to `frontend` |
| Autoscaling and availability | `backend-hpa` (CPU 60%), `backend-vpa` (recommend only), `backend-pdb` (`minAvailable: 1`) |
| ConfigMap | `civicpulse-config`: `POSTGRES_USER`, `POSTGRES_DB`, `TRIAGE_PROVIDER`, `GROQ_MODEL` |
| Secret | `civicpulse-secrets`: `POSTGRES_PASSWORD`, `GROQ_API_KEY` (real values live only in gitignored `secret.local.yaml`) |
| Images | `civicpulse-backend`, `civicpulse-frontend` |
| Liveness / readiness | `GET /health` (never touches the DB) / `GET /ready` (200 only if Postgres and Redis are up, else 503 naming the failed dependency) |
| Observability | `GET /metrics`, `GET /api/meta/providers` |
| Local URL (k3d) | `http://localhost:8080` |

Shell shortcuts used below:

```bash
export NS=civicpulse
alias k='kubectl -n civicpulse'
```

---

## 1. Deploy

### 1.1 Local with Docker Compose (development)

```bash
cp .env.example .env            # fill in POSTGRES_PASSWORD and GROQ_API_KEY; .env is gitignored
docker compose up --build -d
docker compose ps               # wait until every service is "healthy"
```

Apply migrations and seed (both are safe to run twice):

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

Persistence check: `docker compose down` followed by `docker compose up -d` keeps all rows. Only `docker compose down -v` deletes the volumes, so never use `-v` on data you want to keep.

### 1.2 Local Kubernetes with k3d

**One-time cluster setup**

```bash
k3d cluster create civicpulse --agents 2 -p "8080:80@loadbalancer"
kubectl top nodes               # k3s ships metrics-server; this must print CPU/memory
```

If `kubectl top nodes` fails, install metrics-server:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl -n kube-system patch deploy metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

Install the Vertical Pod Autoscaler **before** applying the manifests. `vpa.yaml` is part of the kustomization and fails without the VPA CRDs:

```bash
git clone https://github.com/kubernetes/autoscaler.git /tmp/autoscaler
/tmp/autoscaler/vertical-pod-autoscaler/hack/vpa-up.sh
```

**Create the secret (local file, never committed)**

```bash
cp k8s/base/secret.yaml k8s/overlays/dev/secret.local.yaml
# edit the copy: replace both REPLACE_ME values (POSTGRES_PASSWORD, GROQ_API_KEY)
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/overlays/dev/secret.local.yaml
```

`k8s/overlays/*/secret.local.yaml` is in `.gitignore`. The committed `k8s/base/secret.yaml` only holds `REPLACE_ME` placeholders.

**Build, tag with the commit SHA, and load the images into the cluster**

```bash
SHA=$(git rev-parse --short HEAD)
docker build -t civicpulse-backend:$SHA backend
docker build -t civicpulse-frontend:$SHA frontend
k3d image import civicpulse-backend:$SHA civicpulse-frontend:$SHA -c civicpulse
```

**Apply and roll out**

```bash
kubectl apply -k k8s/overlays/dev
kubectl -n civicpulse set image deployment/backend  backend=civicpulse-backend:$SHA
kubectl -n civicpulse set image deployment/frontend frontend=civicpulse-frontend:$SHA
kubectl -n civicpulse rollout status deployment/backend  --timeout=180s
kubectl -n civicpulse rollout status deployment/frontend --timeout=180s
```

**First-time data setup**

```bash
kubectl -n civicpulse exec deploy/backend -- alembic upgrade head
kubectl -n civicpulse exec deploy/backend -- python -m app.seed
```

**Verify**

```bash
kubectl -n civicpulse get pods,svc,ingress,hpa,pdb
curl -si http://localhost:8080/api/stats | head -n 12      # expect 200 and an X-Cache header
curl -s  http://localhost:8080/api/meta/providers
```

Healthy state: `backend` and `frontend` each have 2 ready pods, `postgres-0` is `1/1 Running`, `redis` is `1/1 Running`, and the HPA shows a real percentage such as `12%/60%`, not `<unknown>/60%`.

### 1.3 Production overlay and deploy by SHA

Production never runs `:latest` or `:dev`. Every deployment points at an immutable commit SHA:

```bash
cd k8s/overlays/prod
kustomize edit set image \
  civicpulse-backend=ghcr.io/sajalishtiaq/civicpulse-backend:<git-sha> \
  civicpulse-frontend=ghcr.io/sajalishtiaq/civicpulse-frontend:<git-sha>
cd ../../..
kubectl apply -k k8s/overlays/prod
kubectl -n civicpulse rollout status deployment/backend
```

When `cd.yml` runs on a push to `main`, it does the same steps automatically: test, build and push to GHCR tagged with the commit SHA, deploy to an ephemeral cluster, then smoke test through the Ingress.

**What is production running?** The answer is one SHA:

```bash
kubectl -n civicpulse get deploy backend -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
git show <that-sha>
```

### 1.4 Production-style Compose

```bash
export IMAGE_TAG=<git-sha>
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

`compose.prod.yaml` uses `image: ...:${IMAGE_TAG}`, has no `build:` key, and publishes no database or cache port.

---

## 2. Roll back

Two mechanisms. Use the fast one during an incident and the auditable one afterwards.

| | `kubectl rollout undo` | Re-apply previous SHA from Git |
|---|---|---|
| Speed | Seconds | A few minutes (revert, PR, apply) |
| Audit trail | None in Git | Full and reviewable |
| Use when | Users are affected right now (the 3 a.m. answer) | The fire is out and the cluster must match Git again |

**Important:** `rollout undo` only restores an older version if the older revision used a different image tag. That is why every build is tagged with its SHA (section 1.2). If two revisions both use `:dev`, undo restores the manifest but runs the same code.

### 2.1 Fast, imperative

```bash
kubectl -n civicpulse rollout history deployment/backend
kubectl -n civicpulse rollout undo deployment/backend
kubectl -n civicpulse rollout status deployment/backend
# to a specific revision:
kubectl -n civicpulse rollout undo deployment/backend --to-revision=<n>
# frontend, if it was part of the bad release:
kubectl -n civicpulse rollout undo deployment/frontend
```

Confirm the tag is back to the last good SHA:

```bash
kubectl -n civicpulse get deploy backend -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

The cluster now differs from Git, so follow up with 2.2 immediately. Otherwise the next deploy brings the bad version back.

### 2.2 Declarative, auditable

```bash
git revert <bad-commit>
# or set the image back explicitly:
cd k8s/overlays/prod
kustomize edit set image civicpulse-backend=ghcr.io/sajalishtiaq/civicpulse-backend:<previous-sha>
cd ../../..
kubectl apply -k k8s/overlays/prod
kubectl -n civicpulse rollout status deployment/backend
```

Open a PR from `dev` to `main` with the revert so Git, CI and the cluster agree.

### 2.3 Compose

```bash
export IMAGE_TAG=<previous-sha>
docker compose -f compose.prod.yaml up -d
```

### 2.4 Database migrations

Rolling back the image does **not** roll back the schema. If the bad release included an Alembic migration:

```bash
kubectl -n civicpulse exec deploy/backend -- alembic current
kubectl -n civicpulse exec deploy/backend -- alembic downgrade -1
```

Only downgrade if the previous code cannot run on the new schema. Prefer additive, backwards-compatible migrations so this is rarely needed.

---

## 3. Read logs

Logs are **JSON on stdout**, never a file, and every line carries a `request_id` (taken from the `X-Request-ID` header, or generated if absent).

### 3.1 Kubernetes

```bash
kubectl -n civicpulse logs deploy/backend --tail=100
kubectl -n civicpulse logs deploy/backend -f                         # follow one pod
kubectl -n civicpulse logs -l app=backend --prefix --tail=50         # all backend replicas
kubectl -n civicpulse logs <pod> --previous                          # the last crashed container
kubectl -n civicpulse logs postgres-0
kubectl -n civicpulse logs deploy/redis
kubectl -n civicpulse describe pod <pod>                             # probe failures, OOMKilled, events
kubectl -n civicpulse get events --sort-by=.lastTimestamp | tail -20
```

### 3.2 Compose

```bash
docker compose logs -f backend
docker compose logs --since 10m backend
docker compose logs --tail=100 postgres redis
```

### 3.3 Filtering with jq

`fromjson?` skips any non-JSON line (for example a startup banner) instead of failing.

```bash
# Follow a single request end to end
kubectl -n civicpulse logs -l app=backend --tail=2000 \
  | jq -R 'fromjson? | select(.request_id=="<id>")'

# Warnings and errors only
kubectl -n civicpulse logs -l app=backend --tail=2000 \
  | jq -R 'fromjson? | select((.level // .levelname) as $l | $l=="WARNING" or $l=="ERROR")'

# Triage fallbacks (one WARNING per fallback: complaint id, provider, error class)
kubectl -n civicpulse logs -l app=backend --tail=5000 \
  | jq -R 'fromjson? | select(tostring | test("fallback";"i"))'
```

To trace one user action, send your own ID and search for it:

```bash
curl -si -H 'X-Request-ID: debug-123' http://localhost:8080/api/stats | head -n 5
kubectl -n civicpulse logs -l app=backend --tail=500 | grep debug-123
```

### 3.4 Metrics

```bash
kubectl -n civicpulse port-forward deploy/backend 8000:8000
curl -s localhost:8000/metrics | grep -Ei 'triage|fallback|http_request'
```

Watch the request count, the request latency histogram, triage latency, and the fallback counter.

---

## 4. When triage starts failing

**Symptoms:** `triaged_by` is mostly `rules:fallback`, submissions feel slow, fallback WARNING lines are frequent, or categories look wrong on the dashboard.

**Key point:** a triage failure never returns a 500 to the citizen. The service falls back to `RuleBasedTriage` and stores `triaged_by = "rules:fallback"`. This is a degradation, not an outage, so diagnose first, then restore.

### 4.1 Diagnose, in this order

1. **Ask the system.**
   ```bash
   curl -s http://localhost:8080/api/meta/providers | jq
   ```
   This shows the active provider and the last 20 outcomes (provider, latency in ms, fallback yes/no). Many `fallback: true` entries confirm the problem, and the latency column shows whether calls are timing out.

2. **Find the error class** in the fallback WARNING lines (section 3.3), then match it:

   | Error class | Likely cause | Fix |
   |---|---|---|
   | `Timeout` / `ReadTimeout` (10 s cap) | Groq slow or unreachable | 4.2a |
   | `429` / `RateLimitError` | Free-tier quota exhausted | 4.2b |
   | `401` / `403` / `AuthenticationError` | Bad, expired or missing `GROQ_API_KEY` | 4.2c |
   | `5xx` | Groq outage | 4.2d |
   | `400` (never retried) | Our request is wrong, often an invalid `GROQ_MODEL` | 4.2e |
   | `ValidationError` / `JSONDecodeError` | Model returned malformed or out-of-enum output; the validator rejected it safely | 4.2f |
   | `ConnectError` / DNS failure | The pod has no outbound route | 4.2g |

3. **Confirm it is triage and not the platform.** `/health` and `/ready` should both return 200. If `/ready` returns 503, this is a different incident (section 5).

4. **Check the configuration** (never print the key):
   ```bash
   kubectl -n civicpulse get configmap civicpulse-config -o jsonpath='{.data}' | jq
   kubectl -n civicpulse get secret civicpulse-secrets -o jsonpath='{.data}' | jq 'keys'
   ```

### 4.2 Fixes

**a. Timeouts.** Check the Groq status page. If it is down, switch provider (4.3) and wait. Do not raise the 10 s timeout as a fix: it only exhausts workers under load.

**b. Rate limit (429).** The free tier is exhausted or one client is hammering the API.
- Look for abuse in the logs. The Redis rate limiter should already be returning 429 with `Retry-After` on `POST /api/complaints`.
- Duplicate complaints are served from the 24 h content-hash cache in Redis, so confirm Redis is healthy (`kubectl -n civicpulse get pod -l app=redis`).
- Groq limits reset on their schedule and the fallback keeps citizens served in the meantime. Switch provider (4.3) if the wait is long.

**c. Bad or missing key.** Update the local secret file, apply it, and restart, because environment variables are read at pod start:
```bash
# edit GROQ_API_KEY in k8s/overlays/dev/secret.local.yaml
kubectl apply -f k8s/overlays/dev/secret.local.yaml
kubectl -n civicpulse rollout restart deployment/backend
kubectl -n civicpulse rollout status deployment/backend
```
If the key was ever exposed, revoke it in the Groq console first, then rotate, and write an incident note. Never paste keys into Git, PRs or chat.

**d. Provider outage.** Switch provider (4.3).

**e. Invalid request.** Verify `GROQ_MODEL` (currently `openai/gpt-oss-20b`) still exists on Groq. If not, change it in `k8s/base/configmap.yaml`, apply, and restart the backend.

**f. Malformed output.** The validator is doing its job, and every rejection becomes a fallback. If the rate is high, the model or prompt has drifted: change `GROQ_MODEL` to another small instruct model, or switch provider.

**g. No outbound route.** In Compose, containers on the `internal: true` network cannot reach the internet, so only the backend (which joins both `edge` and `internal`) can call Groq. Verify:
```bash
docker compose exec backend python -c "import urllib.request as u; print(u.urlopen('https://api.groq.com', timeout=5).status)"
```
In Kubernetes, check cluster DNS and egress:
```bash
kubectl -n civicpulse exec deploy/backend -- python -c "import socket; print(socket.gethostbyname('api.groq.com'))"
```

### 4.3 Switch provider (mitigation)

`TRIAGE_PROVIDER` values: `llm` (Groq, current default), `ollama` (offline container), `rules` (deterministic keywords), `simulated` (CI only, never in production).

```bash
kubectl -n civicpulse patch configmap civicpulse-config \
  --type merge -p '{"data":{"TRIAGE_PROVIDER":"rules"}}'
kubectl -n civicpulse rollout restart deployment/backend
kubectl -n civicpulse rollout status deployment/backend
```

Commit the same change in `k8s/base/configmap.yaml` through a PR, or the next `kubectl apply -k` will revert it. In Compose, edit `TRIAGE_PROVIDER` in `.env` and run `docker compose up -d backend`.

Which one to choose:
- **`rules`**: instant and always works, but categories are coarser. This is the safest emergency setting.
- **`ollama`**: no key, no quota, and no complaint text leaves the machine, but it is slower on CPU and less accurate. It needs the Ollama container and its `ollama_models` volume.

To restore the primary, set `TRIAGE_PROVIDER` back to `llm`, restart, and confirm:

```bash
curl -s http://localhost:8080/api/meta/providers | jq
```

### 4.4 After the incident

- Complaints triaged with `rules:fallback` used keyword rules. Review them if accuracy matters:
  ```bash
  kubectl -n civicpulse exec postgres-0 -- psql -U civicpulse -d civicpulse -c \
    "SELECT id, category, priority, created_at FROM complaints WHERE triaged_by = 'rules:fallback' ORDER BY created_at DESC LIMIT 50;"
  ```
- Record the start and end time, the error class, and the fix.
- If a key leaked: rotate it and write an incident note.

---

## 5. Other common failures

| Symptom | Check | Fix |
|---|---|---|
| `/ready` returns 503 | The response body names the failed dependency | Postgres: `kubectl -n civicpulse describe pod postgres-0` and its logs. Redis: `kubectl -n civicpulse logs deploy/redis`. |
| Pods restart in a loop | `describe pod` for probe events or `OOMKilled` | Liveness must not depend on the DB. Raise memory limits (backend is `256Mi`) or fix the crash. |
| Pods are `Running` but get no traffic | Readiness is failing | Fix the dependency named by `/ready`. This is by design. |
| HPA shows `<unknown>/60%` | `resources.requests.cpu` missing, or metrics-server down | `kubectl top pods -n civicpulse`; `kubectl -n kube-system get pods \| grep metrics`. |
| `kubectl apply -k` fails on `VerticalPodAutoscaler` | VPA CRDs not installed | Run `vpa-up.sh` (section 1.2), then apply again. |
| `ImagePullBackOff` / `ErrImageNeverPull` | Image not in the cluster | `k3d image import <image>:<sha> -c civicpulse`, or check the GHCR tag exists. |
| Backend cannot connect to DB | `DATABASE_URL` or password mismatch | Check `civicpulse-secrets` and that `postgres-0` is Ready. |
| Stats look stale after a new complaint | Cache should be invalidated on write | Check Redis connectivity; the TTL is 30 s regardless. |
| `409` on a status change | Invalid transition | Expected. Allowed: open to in_progress, open to rejected, in_progress to resolved, in_progress to rejected. |
| `429` on submit | Redis rate limiter | Wait for `Retry-After`. |
| Data missing after the Postgres pod is deleted | PVC should preserve it | `kubectl -n civicpulse get pvc`; confirm `pgdata-postgres-0` is `Bound`. |

**Postgres persistence test (for demos):**

```bash
kubectl -n civicpulse delete pod postgres-0
kubectl -n civicpulse wait --for=condition=ready pod/postgres-0 --timeout=120s
curl -s "http://localhost:8080/api/complaints?page=1&page_size=1" | jq .total
```

**HPA load test (from `load/k6-script.js`):**

```bash
kubectl -n civicpulse get hpa -w        # terminal 1
k6 run load/k6-script.js                # terminal 2
kubectl -n civicpulse describe vpa backend-vpa   # read Target / Lower / Upper bound after the run
```

---

Keep this runbook current: if you resolve an incident in a way not written here, add it to section 4 or 5 in the same PR.
