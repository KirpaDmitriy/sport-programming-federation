# FSP / Career

A reverse-hiring platform for the FSP 2026 special track. Candidates complete a questionnaire and a
versioned knowledge test; employers search anonymous profiles and send offers with a salary range.
Candidates disclose selected contacts to a company by accepting its invitation or applying to its vacancy.
Recurring company tasks provide a separate freshness signal.

Demo stand: <https://188.166.88.183>. Email verification uses the disclosed demo code `123456`.
Rust and PostgreSQL persist platform data. Knowledge tests are scored deterministically; digital PDF import and
contextual assistance use isolated extraction and Bifrost. Seed candidates and the separate HTTP FSP provider
are explicitly fictional. Email delivery and GitHub OAuth setup are deferred. Capability flags describe
configuration, not provider health. Knowledge results do not certify professional experience.
See [knowledge tests](docs/knowledge-tests.md) and [FSP simulator](docs/fsp-simulator.md).

## Repository

| Path | Contents |
| --- | --- |
| [frontend/](frontend/README.md) | React / TypeScript application, Russian interface |
| [contracts/](contracts/README.md) | Shared OpenAPI contract, error catalog and type generator |
| [mock-server/](mock-server/README.md) | Stateful development mock and executable behavior reference |
| [backend/](backend/README.md) | Hexagonal Rust API, PostgreSQL and integration adapters |
| [infra/](infra/README.md) | Stand provisioning, immutable releases, recovery, backups and nginx |
| [docs/product/](docs/product/BUSINESS_RULES.md) | Implemented rules, requirements and organizer specification |
| [Stability audit](docs/stability-audit.md) | Session reconciliation, findings, plan and verification evidence |

Ownership and contribution rules: [AGENTS.md](AGENTS.md). Feature PRs target `danil` or `dima`;
checked cascades merge into `dev`, then `main`. Deployment ships the exact checked main commit.

## Run

```sh
docker compose up --build       # http://localhost:8080; demo verification code 123456
docker compose down            # keeps PostgreSQL data in pg-data
```

Only nginx's application port is public; the API shares its loopback namespace. PostgreSQL's development
port is bound to `127.0.0.1:5434`. Use `FSP_PORT=9090` for a different application port.
`docker compose down --volumes` deliberately destroys local data; it is not an update or deployment step.

## Develop and verify

```sh
just install                   # pinned TypeScript dependencies via Bun
just mock                      # development mock on 127.0.0.1:4010
just dev                       # frontend on http://127.0.0.1:5173
just db-up                     # local PostgreSQL for Rust and integration tests
just fsp-simulator             # fictional provider on 127.0.0.1:4020 (separate terminal)
just backend                   # Rust API on 127.0.0.1:8080
just verify                    # contract, mock, frontend types/lint/tests/build
just backend-check             # rustfmt, clippy, unit and PostgreSQL HTTP/storage tests
just e2e                       # browser acceptance against the mock
```

The historical Python/FastAPI MVP and its documentation are preserved at tag `archive/dima-mvp`.
Inspect it with `git show archive/dima-mvp:README.md` or a separate detached worktree; it is not part of main.
