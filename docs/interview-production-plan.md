# Graph interview production checklist

The graph interview is complete only when it is usable through the authenticated product, survives process restarts,
and is released by the same verified `main` pipeline as the rest of the platform.

## Experiment contract

- Algorithmic change: use the first unresolved prerequisite as the next interview frontier and return to the
  composite competency after its prerequisites are confirmed.
- Expected effect: an incomplete composite answer produces a question about a missing prerequisite; confirming that
  prerequisite eventually returns the interview to the composite competency.
- Failure condition: the next question ignores an unresolved prerequisite, repeats a confirmed node, or cannot return
  to the composite node after its prerequisites are confirmed.
- Machine-readable record: `backend/experiments/graph-interview-traversal-v1.json`.

## Definition of done

- [x] Persist interview sessions with optimistic revision checks.
- [x] Keep a deterministic offline CPU model and use Bifrost when configured.
- [x] Authenticate browser users through the platform API; never expose the internal service token.
- [x] Let a candidate start, resume and answer an interview from the product UI.
- [x] Render graph progress and an accessible list alternative.
- [x] Keep voice playback optional and local to the browser; text remains the required path.
- [x] Build, install, start, health-check and roll back the service in `infra/release.sh`.
- [x] Cover the service in backend, Compose and release-safety CI gates.
- [ ] Pass unit/contract/UI tests, an offline HTTP smoke test and the experiment-record check.
- [ ] Deploy verified `main` and confirm the public authenticated journey.
