default:
    @just --list

# Install the JS modules: mock server, contract generator, frontend
install:
    bun install --cwd mock-server --frozen-lockfile
    bun install --cwd contracts/codegen --frozen-lockfile
    bun install --cwd frontend --frozen-lockfile

# Mock API on 127.0.0.1:4010
mock:
    bun run --cwd mock-server start

# Frontend on 127.0.0.1:5173; FSP_API_TARGET selects the API (default: the mock)
dev:
    bun run --cwd frontend dev

# Rebuild contracts/openapi.json, the frontend types and the operation index
contract:
    bun run --cwd mock-server contract
    bun run --cwd contracts/codegen generate

# Types, lint and tests of the contract generator, the mock and the frontend
verify:
    bun run --cwd contracts/codegen typecheck
    bun run --cwd contracts/codegen lint
    bun run --cwd mock-server typecheck
    bun run --cwd mock-server lint
    bun run --cwd mock-server test
    bun run --cwd frontend verify

# Browser acceptance tests against the mock
e2e:
    bun run --cwd frontend e2e

# Rust backend on 127.0.0.1:8080
backend:
    cd backend && cargo run -p fsp-server

# Rust backend: format check, clippy and tests
backend-check:
    cd backend && cargo fmt --all --check
    cd backend && cargo clippy --workspace --all-targets --locked -- -D warnings
    cd backend && cargo test --workspace --locked

# Build a git ref on the demo stand and switch to it
deploy ref="main":
    infra/deploy.sh {{ref}}
