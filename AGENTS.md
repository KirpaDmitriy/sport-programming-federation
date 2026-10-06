# Repository rules

The FSP reverse-hiring platform for the FSP 2026 special track: contract, mock, frontend, Rust backend and the demo
stand. Dima's first version, a Python (FastAPI) MVP, lives in branch `dima/mvp` and is not part of `main`.

## Map

| Path | Owner | Contents |
| --- | --- | --- |
| [`backend/`](backend/README.md) | Дима | Hexagonal Rust backend that implements the contract (skeleton: crate boundaries, transport rules, `/health`) |
| [`contracts/`](contracts/README.md) | shared | OpenAPI contract, error codes, generated operation index, TypeScript generator |
| [`mock-server/`](mock-server/README.md) | Данил | Stateful HTTP mock of the contract: frontend dev server and behavior reference for the backend |
| [`frontend/`](frontend/README.md) | Данил | React/TypeScript/TanStack application (FSD); its own rules are in [`frontend/AGENTS.md`](frontend/AGENTS.md) |
| [`infra/`](infra/README.md) | Данил | Demo stand on one DigitalOcean droplet: provisioning, deployment, nginx |
| [`docker-compose.yml`](docker-compose.yml), `*/Dockerfile` | shared | The platform in containers: API, web and the optional backend ([`infra/README.md`](infra/README.md#docker)) |
| [`docs/product/`](docs/product/BUSINESS_RULES.md) | shared | Business rules as implemented, requirements traceability, the organizer's specification |

## Rules

- Change another owner's tree only in coordination with them.
- The contract is the boundary between frontend and backend. Change it only as described in
  [`contracts/README.md`](contracts/README.md), in one change that updates every side.
- Work on a named branch (`danil/…`, `dima/…`), merge into `dev`, then `dev` into `main`. `main` is what
  `infra/deploy.sh` ships to the stand.
- Never commit secrets. Stand access lives in the git-ignored `.fsp-infra/`; service secrets belong in environment
  files on the host.
- Write code, comments, documentation and commit messages in English; user-facing text is Russian.
- JavaScript-ecosystem code is strict TypeScript 7 checked by `tsc`; no hand-written JavaScript and no older
  TypeScript.

## Toolchains and checks

| Module | Toolchain | Check |
| --- | --- | --- |
| contract, mock, frontend | TypeScript 7.0.2 (strict) on Bun 1.4.2; Vitest on Node 26 (24.15 or newer works); Biome 2.5 from the root `biome.json` | `just verify`, `just e2e` |
| backend | Rust 1.99.0 (`backend/rust-toolchain.toml`), edition 2024 | `just backend-check` |

`just` lists the tasks for the TypeScript modules, the backend, Docker and the stand. CI:
`.github/workflows/platform.yml` (contract, mock, frontend), `.github/workflows/backend.yml` (Rust) and
`.github/workflows/docker.yml` (images and a smoke run of `docker-compose.yml`).
