# Graph-guided interview service

`fsp-interview-service` is an internal Rust HTTP service for adaptive interviews. The browser uses the authenticated
platform routes under `/api/v1/me/interviews`; the platform resolves the candidate identity and calls this service
with a private bearer token. The token never reaches the browser.

Sessions are stored in PostgreSQL as versioned JSON documents. A conditional revision update rejects stale answers,
and a partial unique index permits only one active interview per candidate. The service can restart or be replaced by
a release without losing the current question or evidence.

## Product boundary

The competency graph is the interview program, not a visualization added after the conversation. The first
`backend-middle-v1` blueprint starts with an idempotency scenario. An incomplete answer moves the frontier to an
unknown prerequisite; once prerequisites are covered, the engine can return to the unresolved composite node.
The engine, not the language model, selects the next competency.

The service stores evidence states rather than personality scores:

- `unknown`: not assessed;
- `observed`: the answer contains a relevant signal but does not satisfy the rubric;
- `partial`: several rubric elements are present;
- `confirmed`: every required rubric group is supported;
- `contradicted`: a configured LLM found an explicit incorrect claim.

Technical and behavioral nodes remain separate. The shipped behavioral node assesses how a candidate clarifies
ambiguous requirements; it does not infer personality, emotion, honesty or protected traits.

## Runtime modes

When `BIFROST_CHAT_URL` is configured, Bifrost generates surface variants and evaluates answers against the supplied
rubric. Output is schema-checked, evidence must quote the answer exactly, and the model cannot choose the next node
or assign a platform grade. `INTERVIEW_BIFROST_MODEL` selects the model independently from the main API.

Without Bifrost, an explicit `offline_rubric` mode selects versioned local scenarios and checks rubric concepts on
CPU. It exists for development and deterministic demonstrations; it is not evidence of assessment validity.

Required configuration:

| Variable | Meaning |
| --- | --- |
| `INTERVIEW_API_TOKEN` | Internal bearer token; there is no insecure default in the binary |
| `DATABASE_URL` | PostgreSQL connection used for durable sessions |
| `INTERVIEW_HOST` | Bind host, default `127.0.0.1` |
| `INTERVIEW_PORT` | Bind port, default `4040`; `4030` belongs to GitHub insights |
| `BIFROST_CHAT_URL` | Optional OpenAI-compatible Bifrost chat endpoint |
| `BIFROST_API_KEY` | Optional Bifrost bearer key |
| `INTERVIEW_BIFROST_MODEL` | Interview model; otherwise `BIFROST_MODEL`, then `openai/gpt-5-mini` |

Compose uses `demo-interview-token` only for the local demo profile.

## HTTP flow

All routes except `/health` require `Authorization: Bearer $INTERVIEW_API_TOKEN`.

```text
GET  /v1/blueprints/backend-middle-v1
GET  /v1/candidates/{candidateId}/interviews
POST /v1/interviews
GET  /v1/interviews/{id}
POST /v1/interviews/{id}/answers
```

Start payload:

```json
{
  "candidateId": "candidate-024",
  "blueprintId": "backend-middle-v1",
  "maxTurns": 10
}
```

Answer payload uses optimistic concurrency:

```json
{
  "questionId": "q-1-...",
  "answer": "Использую ключ идемпотентности...",
  "revision": 0
}
```

The returned question contains identical `prompt` and `delivery.speechText` fields plus an `avatarCue`. The product UI
uses the browser's Russian speech synthesizer when the candidate asks it to read the question; text always remains
available.

## Voice and avatar decision

The implemented experience is text plus optional local voice, not generated talking-head video. Real-time video
generation adds latency, cost, an external biometric processor and no evidence quality. The recommended delivery is:

1. The candidate types and confirms an answer; no microphone or camera permission is required.
2. Bifrost creates scenario variants and evaluates evidence when configured.
3. The browser can voice `delivery.speechText` with a locally available Russian voice.
4. A code-rendered avatar indicates the speaking state without sending biometric data to a provider.

Candidate camera recording should remain optional, stored only with explicit consent, and never be used to infer
emotion, honesty, accent, gaze or personality. It can be added later as a replay artifact for a human employer; it
is not part of automated scoring.

Camera recording, STT and media storage are not part of automated scoring. They are deliberately absent until there
is a reviewed consent, retention and human-replay workflow.

## Verification

`backend/experiments/graph-interview-traversal-v1.json` records the expected effect, failure condition and observed
test set for the single graph-frontier algorithmic change. Run:

```sh
cd backend
cargo test -p fsp-interview-service
```
