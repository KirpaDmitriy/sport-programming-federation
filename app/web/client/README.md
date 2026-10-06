# Python MVP browser client

The script behind the Python MVP's single page (`app/web/static/index.html`), written in strict TypeScript 7 and
bundled by Bun into `app/web/static/app.js`, which FastAPI serves at `/assets/app.js`. The bundle is committed, so
the MVP still deploys as a plain Python application with no Node or Bun on the host.

## Layout

| File | Contents |
| --- | --- |
| `src/main.ts` | Entry point: page-level event bindings and `boot()` |
| `src/employer.ts` | Vacancy list, candidate filters and cards, candidate dialog, invitation and vacancy forms |
| `src/candidate.ts` | Demo candidate dashboard |
| `src/graph.ts` | SVG skill graph |
| `src/account.ts` | Sign-up, sign-in, both role accounts, assessment, applications |
| `src/views.ts` | Switching between the employer, candidate and account views |
| `src/state.ts` | Page state and lookups |
| `src/api.ts` | `fetch` wrapper with the FastAPI error format |
| `src/dom.ts`, `src/format.ts` | Checked element lookup, form helpers, toasts; HTML escaping and number formatting |
| `src/types.ts` | Response shapes of the FastAPI handlers and request bodies from `app/web/schemas.py` |

`src/types.ts` is written by hand: most handlers return plain `dict`s, so `docs/openapi.json` carries no response
schemas to generate from. When a handler's response changes, update the matching type.

## Commands

From the repository root:

```sh
bun install --cwd app/web/client --frozen-lockfile
bun run --cwd app/web/client build       # rebuild app/web/static/app.js (also: just mvp-web)
bun run --cwd app/web/client check       # fail if the committed bundle differs from a fresh build
bun run --cwd app/web/client typecheck   # tsc 7 over src/ (DOM) and build.ts (Bun)
bun run --cwd app/web/client lint        # Biome, from the root biome.json
```

Commit the rebuilt `app.js` together with the source change. `just verify` and the `mvp-web` job in
`.github/workflows/platform.yml` run `typecheck`, `lint` and `check`; `tests/test_api.py` checks that the bundle is
served.
