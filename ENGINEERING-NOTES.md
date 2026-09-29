# CivicPulse — Engineering Notes (5.2)

All file and line references are to this repository as committed. Where an answer depends on something
that is **not in the repo** (a measured number, a lecture slide's wording, a personal debugging story),
it is marked **⚠ FILL IN** rather than guessed. Search for `⚠` before submitting.

## 1. Three things that differ between my laptop and a CI runner

* #: 1; Difference: Interpreter / OS toolchain; What the laptop has: Whatever Python/Node is installed locally; What freezes it: `backend/Dockerfile:2` and `:13` → `python:3.12-slim`; `frontend/Dockerfile:2` → `node:22-alpine`; `frontend/Dockerfile:13` → `nginx:1.27-alpine`
* #: 2; Difference: Where code and dependencies come from; What the laptop has: Host source tree, host `venv`/`node_modules`; What freezes it: `backend/Dockerfile:20` (`COPY . .`), `backend/Dockerfile:9-10` (`pip install -r requirements.txt`), `frontend/Dockerfile:6-7` (`npm ci`)
* #: 3; Difference: Configuration and secrets; What the laptop has: A `.env` file, `frontend/public/config.js` pointing at `localhost:8000`; What freezes it: `backend/.dockerignore:5` (`.env` excluded from the image), `backend/app/config.py:7-11` (reads only env vars), `frontend/docker-entrypoint.sh:4-8` (writes `config.js` at container start)

**1. Toolchain.** The `FROM` lines are the freeze. A CI runner's system Python is irrelevant because the
build happens inside the image. The compiler (`gcc`, `backend/Dockerfile:6-7`) exists only in the builder
stage; the final stage (`:13`) starts clean from `python:3.12-slim`, so it can't be silently relied on at runtime.
Weakness: these are tags, not digests. `python:3.12-slim` moves when upstream publishes a patch release.
Pinning `@sha256:…` would freeze it completely.

**2. Code and dependencies.** On my laptop, `compose.yaml:56-57` bind mounts `./backend/app` over `/app/app` and
`:58` runs `uvicorn … --reload`, so I run host code, not image code. `compose.prod.yaml` has no such mount and
no `command:` override, so the container runs what `backend/Dockerfile:20` copied in and the image's `CMD`
(`:33`). For the frontend, `npm ci` (`frontend/Dockerfile:7`) installs exactly what `package-lock.json`
records, even though `package.json:13-28` uses `^` ranges. `npm install` on a laptop could drift; `npm ci` cannot.

*Honest gap:* `backend/requirements.txt` is only partly frozen. Lines 1 to 5, 7, 9 to 11 are `==` pins, but
**line 6 (`pydantic>=2.9,<3.0`) and line 8 (`groq>=0.31.0`) are ranges**. Two CI runs on different days can
resolve different versions of the two libraries that matter most for the LLM path (schema validation and
the provider SDK). The fix is a compiled lockfile (`pip-compile --generate-hashes`) and
`pip install --require-hashes`.

**3. Configuration.** `.env` is excluded from the build context (`backend/.dockerignore:5`), so the image never
contains a laptop's settings. `config.py` defaults `TRIAGE_PROVIDER` to `rules` (`:8`), so a runner with no
env at all cannot reach for a live LLM by accident. For the frontend, `public/config.js:2` hardcodes
`http://localhost:8000` for laptop dev, and the entrypoint overwrites it at start up
(`docker-entrypoint.sh:4-8`) with `${API_BASE_URL:-}`, which is `""` in both compose files
(`compose.yaml:79`, `compose.prod.yaml:89`) and in `k8s/base/frontend.yaml:29-30`. Empty means same origin,
which nginx proxies (`frontend/nginx.conf:7-12`).

## 2. Where the pipeline sits on the CI/CD maturity ladder (Lecture 03, slide 32)

**What the repo actually contains.** There is **no pipeline definition committed**: no `.github/workflows/`,
no `.gitlab-ci.yml`, no `Makefile`. What exists are the *inputs* a pipeline would consume:

* Automated tests that need no network or external services: `backend/tests/test_triage_fallback.py`,
  `backend/tests/test_prompt_injection.py`, run via `backend/pytest.ini`.
* Reproducible multi stage image builds (`backend/Dockerfile`, `frontend/Dockerfile`).
* A registry shaped deploy target: `compose.prod.yaml:55,83` (`ghcr.io/yourusername/…:${IMAGE_TAG}`) and
  the Kustomize `images:` block in `k8s/overlays/prod/kustomization.yaml:5-11`.

**Rung.** By what is committed, this sits at *automated tests and repeatable builds exist, but build, test, and
publish are triggered by a human, not by a commit*. That is the step between "manual" and "continuous integration".
⚠ FILL IN: map that sentence onto the exact rung label on slide 32; I don't have the slide deck's wording. If a
pipeline exists outside this repo (e.g. configured in a UI), name it and correct this section.

Two more pieces of evidence for "not yet delivery":

* `k8s/overlays/prod/kustomization.yaml:8,11` set `newTag: latest`, a mutable tag, so a deploy is not
  traceable to a commit.
* Nothing runs database migrations at deploy time. `alembic` appears in no Dockerfile or manifest (I grepped),
  so schema changes are a manual `alembic upgrade head`.

**Next rung and what it buys.** A CI workflow that, on every merge: (a) runs `pytest` and `npm run lint && npm run build`,
(b) builds both images once, (c) pushes them tagged with the commit SHA, and (d) opens or applies a change to the
overlay's `newTag`. That buys (i) the tested artifact and the shipped artifact being the same bytes, (ii) rollback
by re applying a previous SHA, and (iii) failures caught before merge instead of at deploy.

## 3. The line guaranteeing build once deploy many

Two lines carry it:

1. **`compose.prod.yaml:55`** (backend) and **`:83`** (frontend): `image: ghcr.io/yourusername/civicpulse-…:${IMAGE_TAG}`.
   There is no `build:` key in this file, so prod cannot build; it can only pull an already built tag.
   (Contrast `compose.yaml:45-46`, which does build; that's the dev file.)
2. **`k8s/overlays/prod/kustomization.yaml:5-11`** rewrites the base's `civicpulse-backend:dev`
   (`k8s/base/backend.yaml:24`) and `civicpulse-frontend:dev` (`k8s/base/frontend.yaml:24`) to registry
   images. The base manifest never changes between environments; only the overlay's `images:` does.

What makes the *same image* valid in every environment is that nothing environment specific is baked in:
config comes from env vars (`backend/app/config.py:7-11`) and the frontend's API base URL is written at
container start (`frontend/docker-entrypoint.sh:4-8`) instead of at `npm run build` time. Vite would
otherwise inline `VITE_*` values into the JS bundle at build.

**What breaks without it.** If each environment ran its own `docker build`, staging and prod would be different
artifacts: a base image patch, an unpinned dependency (`requirements.txt:6,8`), or a changed `npm` registry
response could land in prod but not in what was tested. And if the API URL were baked in at build, moving
the image from dev to prod would point the browser at `localhost:8000`.

**Where my repo currently violates the guarantee:** `newTag: latest` (`prod/kustomization.yaml:8,11`).
`latest` is mutable, so two clusters applying the same overlay at different times can run different images.
The correct value is an immutable SHA or digest written by CI, and `imagePullPolicy` (`backend.yaml:25`)
should not be `IfNotPresent` with a mutable tag, because a node holding a stale `latest` will never re pull.

## 4. "Correct" for a probabilistic LLM component, and keeping CI deterministic (Lecture 01, slide 34)

**What "correct" means.** For `LLMTriage` (`backend/app/providers/triage/llm.py`) I cannot assert *which*
label the model returns, because two runs on the same complaint may differ. I can assert **properties that
must hold for every output**:

1. **Shape:** the output validates against `TriageResult` (`base.py:6-10`): `category` and `priority` are members of the
   enums in `models.py:8-19`, `summary` ≤ 140 chars, `confidence` in [0, 1]. Anything else is a failure
   (`llm.py:44-49`, and the `isinstance` check at `factory.py:31-32`).
2. **Availability:** a complaint is always stored with a valid triage, even if the model is down, slow, or wrong shaped.
   `factory.py:35-39` catches everything and substitutes `RuleBasedTriage`, recording `triaged_by = "rules:fallback"`
   (`:38`) so a degraded result is distinguishable from a real one in the `triaged_by` column (`models.py:38`).
3. **Bounded latency:** `timeout=10` (`llm.py:40`), one retry with jitter (`:31,54`). Malformed output is *not* retried
   (`:46-49`) because retrying a schema violation wastes 10 s for the same failure.
4. **Untrusted input:** the complaint text is delimited and labelled as data (`llm.py:10-11,28`).

The label's *accuracy* is a separate quality question, measured offline against a labelled set, not something a unit
test can pin.

**How CI stays deterministic.** The provider is selected by `TRIAGE_PROVIDER` (`factory.py:8-23`), with three
test doubles in `simulated.py`: `SimulatedTriage` (`:5-15`, fixed output, comment at `:6` says "no network calls"),
`AlwaysFailsTriage` (`:18-23`), and `AlwaysMalformedTriage` (`:26-31`). The tests monkeypatch the setting
(`test_triage_fallback.py:7,20`) and prove the fallback path for both failure modes. `LLMTriage` is imported
lazily (`factory.py:16`), so CI never imports `groq` or needs `GROQ_API_KEY`, and `config.py:8` defaults to `rules`.

**Limits of what the tests prove (stated plainly):**

* `test_prompt_injection.py:17` exercises **`RuleBasedTriage`**, not the LLM. Its own comment (`:20-22`) says the
  rules provider is "inherently immune", which is true and also means the test does **not** verify that the prompt
  in `llm.py:9-17` resists injection. Verifying that needs a recorded response test or a periodic live eval.
* The Kubernetes ConfigMap sets `TRIAGE_PROVIDER: "llm"` (`k8s/base/configmap.yaml:9`), so the cluster runs the
  non deterministic path that CI never exercises. That gap is deliberate but should be covered by a smoke test
  that checks `triaged_by` and the schema, not the label.
* `tests/` is excluded from the image (`backend/.dockerignore:6`), so tests must run from source in a CI job,
  not inside the built image.

## 5. HPA lag: seconds between offered load rising and replicas rising

**Measured number: ⚠ FILL IN.** The repo contains no recorded measurement, and I won't invent one. Record it like this:

```bash
# terminal 1: timestamped HPA state
kubectl get hpa backend-hpa -n civicpulse -w | while read l; do echo "$(date +%T) $l"; done
# terminal 2: replica count and readiness
kubectl get deploy backend -n civicpulse -w
# terminal 3: start load (load/k6-script.js), note the wall-clock second k6 starts
k6 run load/k6-script.js
```

Lag = (time `REPLICAS` first increases) minus (time offered load first exceeded the target). Also record the time
the new pod first becomes `Ready`, since "replicas rising" and "capacity rising" are different moments.

* Stage: k6 ramp until per pod CPU crosses target; Source: `k6-script.js:5-9`; My value: ⚠
* Stage: Metrics scrape delay; Source: metrics server resolution (install dependent); My value: ⚠
* Stage: HPA evaluation; Source: controller sync period, default 15 s; My value: ⚠
* Stage: Scale up stabilization; Source: `hpa.yaml:23-24` → 0 s (no deliberate delay); My value: 0 s
* Stage: Pod scheduled + container started; Source: `backend.yaml:25` `IfNotPresent` → no pull; My value: ⚠
* Stage: Pod becomes Ready; Source: **no probe defined** (see below); My value: ⚠

**Where the time goes, from the manifests:**

1. **The signal arrives late.** The HPA acts on averaged CPU from metrics server, which is a scrape (typically
   tens of seconds old) evaluated on a ~15 s controller loop. Neither is configurable from `hpa.yaml`.
2. **Load may not raise CPU quickly.** The k6 script hits only `/api/stats` (`k6-script.js:14`), and that
   endpoint is served from Redis for 30 s at a time (`stats.py:10-11,16-19`). Cache hits are cheap, so 100 VUs
   at `sleep(0.5)` (`:15`) produce modest CPU. The ramp takes 30 s to reach 20 VUs and then 2 min to reach 100
   (`:6-7`), so crossing the threshold may happen well after the ramp starts.
3. **The threshold is small in absolute terms.** Utilization is measured against the *request*, `100m`
   (`backend.yaml:28`), so 60 % (`hpa.yaml:19`) is only ~60m per pod. That makes the HPA *sensitive*, which helps.
4. **Readiness is not gated.** `k8s/base/backend.yaml` defines **no `readinessProbe` or `livenessProbe`**, unlike
   `frontend.yaml:38-47`, `postgres.yaml:34-43`, and `redis.yaml:36-45`. A new backend pod is marked Ready the
   instant its container starts, before uvicorn is listening, so Traefik can route to it and return errors.
   The `/ready` endpoint exists (`routes/health.py:11-20`) but nothing calls it from Kubernetes.

**What would reduce it:**

* Lower `averageUtilization` (`hpa.yaml:19`) or raise `minReplicas` (`:11`) to keep headroom, trading cost for lag.
* Add explicit `scaleUp` policies in `hpa.yaml:23-24` (e.g. allow +100 % per 15 s) rather than relying on defaults.
* Add `readinessProbe` → `/ready` and a `startupProbe` on `backend.yaml` so lag is measured to *serving*
  capacity and rollouts don't send traffic to unready pods.
* Use a load script that reflects real CPU cost (the POST path, `complaints.py:12-24`) instead of a cached GET.
* Shorten the metrics scrape interval on the cluster's metrics server.

## 6. Why VPA is in `Off` mode, and the failure mode of `Auto` alongside the HPA

`k8s/base/vpa.yaml:12` sets `updateMode: "Off"`. In that mode the VPA only *publishes recommendations*
(`kubectl describe vpa backend-vpa -n civicpulse`); it changes nothing. I use those numbers to hand edit
`resources.requests` at `backend.yaml:27-28`.

**Failure mode of `Auto` + HPA.** Both controllers react to the same signal (CPU). The HPA scales on
*usage ÷ request* (`hpa.yaml:15-19`), and the VPA rewrites *request*. They fight:

1. Load rises → usage per pod rises → VPA raises the request (say 100m → 300m).
2. The HPA's denominator just tripled, so utilization drops from, e.g., 150 % to 50 %, below the 60 % target.
   The HPA stops scaling up, or scales *down*, while the real load has not changed.
3. Fewer, bigger pods now carry the same load; usage per pod rises again; the loop repeats.

The result is oscillation and delayed scale out at exactly the moment I need capacity. It is made worse by how
`Auto` applies changes: by evicting pods to restart them with new requests. With `replicas: 2` (`backend.yaml:7`)
and `minAvailable: 1` (`pdb.yaml:7`), each eviction can halve serving capacity mid spike. Since limits are
set (`backend.yaml:29-31`), the VPA also scales them proportionally, so a request change silently changes the
memory ceiling.

The supported way to combine them is HPA on CPU and VPA on a *different* resource, or VPA in `Off`/recommendation mode
as here.

## 7. `internal: true` blocks outbound traffic: what that means for the service that calls a hosted LLM

**The constraint.** `compose.yaml:4-6` (and identically `compose.prod.yaml:4-6`) defines the `internal` network with
`internal: true`. Docker gives such a network no gateway, so containers attached *only* to it cannot reach the internet
(and cannot publish ports). Postgres (`compose.yaml:15-16`) and Redis (`:32-33`) are attached only to `internal`,
so a compromised database container cannot phone home.

**The problem.** The backend calls Groq (`llm.py:4,24,33`), which needs outbound HTTPS and DNS. If the backend were on `internal`
alone, `api.groq.com` would not resolve, the SDK would raise, and the code would hit `llm.py:51-56`.

**How it is resolved in the repo:** the backend is **dual homed**: `compose.yaml:47-49` attaches it to both `edge`
(normal bridge, has egress) and `internal` (reaches `postgres` and `redis` by service name). The frontend is on
`edge` only (`:74-75`), and it reaches the backend over `edge` via nginx (`nginx.conf:8`). Only the backend can
talk to both worlds. Postgres and Redis have no ports published and no route out, and the backend has no
`ports:` entry, so the only published port is the frontend's (`compose.yaml:76-77`).

**A failure that would look like success.** If egress *were* broken, the user would see no error: after 10 s + a
0.5 to 1.5 s jittered sleep + another 10 s (`llm.py:40,54`) the request falls back to rules (`factory.py:35-39`) and returns
201. The only trace is `triaged_by = 'rules:fallback'` in the DB. Since `create_complaint` is a sync `def`
(`complaints.py:13`), each such request can occupy a worker thread for ~20 s. So a blocked egress path
shows up as latency and a fallback rate, not as errors. Check with:
`SELECT triaged_by, count(*) FROM complaints GROUP BY 1;`

**Kubernetes gap.** The cluster does **not** replicate this isolation: `k8s/base/kustomization.yaml` lists no
`NetworkPolicy`, so every pod has default allow egress, including Postgres. To match compose, add a default deny egress
policy to the namespace plus an allow rule for backend → `api.groq.com:443` and DNS, and for backend → postgres/redis.

## 8. The failure that cost more than an hour

**⚠ FILL IN. This has to be my own account; the repository can't tell me what I believed at the time.**
Use this structure and delete the candidates below once the real one is written in.

* **Symptoms:** ⚠ what I saw (exact error text, status codes, what was *not* happening).
* **What I wrongly believed first:** ⚠ the hypothesis, and what made it plausible.
* **Why it was wrong / how long I stayed on it:** ⚠
* **The exact command or log line that told me the truth:** ⚠ paste it verbatim.
* **Fix, and what I changed so it can't recur:** ⚠ file and line.

**Candidates the repo makes plausible (pick the one that really happened, or replace):**

1. *Pod stuck `ErrImagePull`/`ImagePullBackOff`.* `backend.yaml:24-25` references a local only tag
   (`civicpulse-backend:dev`, `IfNotPresent`). A cluster's container runtime doesn't see images built in the host's Docker daemon.
   Truth telling command: `kubectl describe pod -n civicpulse -l app=backend`, the `Events:` block.
2. *`kubectl apply -k k8s/overlays/dev` fails on a fresh clone.* `overlays/dev/kustomization.yaml:5` lists
   `secret.local.yaml`, which is gitignored (`.gitignore:20`). Truth: the `kustomize build` error that names the missing file.
3. *502s / connection refused during rollouts or scale up.* Backend has no readiness probe (see §5.4). Truth:
   `kubectl get endpoints backend -n civicpulse -w` showing an address added before the app listens.
4. *Fallback hiding a broken LLM path.* Requests succeed but `triaged_by = 'rules:fallback'` (§7). Truth: the
   `GROUP BY triaged_by` query, or a `LLM call failed after retry` message in the JSON logs.

## Appendix: gaps I found while writing these notes

* Gap: No CI pipeline file; Where: repo root; Impact: §2
* Gap: `pydantic` and `groq` unpinned; Where: `requirements.txt:6,8`; Impact: §1
* Gap: `newTag: latest`; Where: `k8s/overlays/prod/kustomization.yaml:8,11`; Impact: §3
* Gap: No probes on backend; Where: `k8s/base/backend.yaml`; Impact: §5
* Gap: No migration step in image or manifests; Where: (grep for `alembic`); Impact: §2
* Gap: No `NetworkPolicy`; Where: `k8s/base/kustomization.yaml`; Impact: §7
* Gap: `pytest` and `httpx` installed in the runtime image; Where: `requirements.txt:9-10`; Impact: larger attack surface
* Gap: `TRIAGE_PROVIDER` from ConfigMap isn't tested in CI; Where: `configmap.yaml:9`; Impact: §4
* Gap: `compose.prod.yaml:55,83` still has the `yourusername` placeholder; Where: `compose.prod.yaml`; Impact: §3
