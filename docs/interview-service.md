# Graph-guided interview service

`fsp-interview-service` is an internal Rust HTTP service for adaptive interviews. The platform API and frontend do
not call it yet. It deliberately has its own process and bearer token so the interview algorithm can evolve without
changing the public platform contract or the GitHub integration work.

Sessions are currently held in process memory and are lost on restart. Durable storage and platform identity mapping
belong to the later integration change; the current service proves the graph traversal and model boundary.

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
| `INTERVIEW_HOST` | Bind host, default `127.0.0.1` |
| `INTERVIEW_PORT` | Bind port, default `4030` |
| `BIFROST_CHAT_URL` | Optional OpenAI-compatible Bifrost chat endpoint |
| `BIFROST_API_KEY` | Optional Bifrost bearer key |
| `INTERVIEW_BIFROST_MODEL` | Interview model; otherwise `BIFROST_MODEL`, then `openai/gpt-5-mini` |

Compose uses `demo-interview-token` only for the local demo profile.

## HTTP flow

All routes except `/health` require `Authorization: Bearer $INTERVIEW_API_TOKEN`.

```text
GET  /v1/blueprints/backend-middle-v1
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

The returned question contains identical `prompt` and `delivery.speechText` fields plus an `avatarCue`. This is the
stable boundary for later voice delivery without coupling the interview algorithm to a speech provider.

## Voice and avatar decision

The first user experience should be text plus optional voice, not generated talking-head video. Real-time video
generation adds latency, cost, an external biometric processor and no evidence quality. The recommended delivery is:

1. Yandex SpeechKit streaming STT converts an opt-in microphone stream to editable text.
2. The interview service receives only the confirmed transcript.
3. YandexGPT through Bifrost creates scenario variants and evaluates evidence.
4. SpeechKit TTS voices `delivery.speechText`.
5. A code-rendered SVG or Rive character switches between idle, listening, thinking and speaking. Mouth movement is
   driven by client-side audio amplitude, not generated video.

Candidate camera recording should remain optional, stored only with explicit consent, and never be used to infer
emotion, honesty, accent, gaze or personality. It can be added later as a replay artifact for a human employer; it
is not part of automated scoring.

This service currently implements text delivery and the speaking cue. STT, TTS, media storage, platform auth and
public-contract integration are intentionally not claimed as implemented.

## Verification

`backend/experiments/graph-interview-traversal-v1.json` records the expected effect, failure condition and observed
test set for the single graph-frontier algorithmic change. Run:

```sh
cd backend
cargo test -p fsp-interview-service
```
