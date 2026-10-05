# Repository rules

The FSP reverse-hiring platform for the FSP 2026 special track. The repository holds two things side by side: Dima's
Python MVP «Выготский» in the root, and the modular platform that replaces it (contract, mock, frontend, Rust
backend, stand).

## Map

| Path | Owner | Contents |
| --- | --- | --- |
| `app/`, `tests/`, `tools/`, `deploy/`, `experiments/`, `output/`, `docs/*.md`, `pyproject.toml`, `requirements*.txt` | Дима | Python MVP (FastAPI) with its tests, deployment and submission artifacts; see [`README.md`](README.md) |
| [`backend/`](backend/README.md) | Дима | Rust backend that implements the contract (not started) |
| [`contracts/`](contracts/README.md) | shared | OpenAPI contract, error codes, generated operation index, TypeScript generator |
| [`mock-server/`](mock-server/README.md) | Данил | Stateful HTTP mock of the contract: frontend dev server and behavior reference for the backend |
| [`frontend/`](frontend/README.md) | Данил | React/TypeScript/TanStack application (FSD); its own rules are in [`frontend/AGENTS.md`](frontend/AGENTS.md) |
| [`infra/`](infra/README.md) | Данил | Demo stand on one DigitalOcean droplet: provisioning, deployment, nginx |
| [`docs/product/`](docs/product/BUSINESS_RULES.md) | shared | Business rules as implemented, requirements traceability, the organizer's specification |

## Rules

- Change another owner's tree only in coordination with them. The Python MVP stays where it is until Дима decides
  otherwise.
- The contract is the boundary between frontend and backend. Change it only as described in
  [`contracts/README.md`](contracts/README.md), in one change that updates every side.
- Work on a named branch (`danil/…`, `dima/…`), merge into `dev`, then `dev` into `main`. `main` is what
  `infra/deploy.sh` ships to the stand.
- Never commit secrets. Stand access lives in the git-ignored `.fsp-infra/`; service secrets belong in environment
  files on the host.
- Write code, comments, documentation and commit messages in English; user-facing text is Russian.

## Toolchains and checks

| Module | Toolchain | Check |
| --- | --- | --- |
| contract, mock, frontend | Bun 1.4.2 (Vitest runs on Node ≥ 24.15) | `just verify`, `just e2e` |
| Python MVP | Python 3.12 | `pytest`, `python tools/offline_smoke.py`, `python tools/experiments.py check` |
| backend | Rust, pinned by the backend owner | defined with the backend |

`just` lists the tasks for the JS modules and the stand. CI: `.github/workflows/test.yml` (Python MVP) and
`.github/workflows/platform.yml` (contract, mock, frontend).
