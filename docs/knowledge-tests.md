# Knowledge assessments

New attempts use `execution: questionnaire` and `knowledge-v2`. The Rust domain evaluator is authoritative;
the development HTTP mock reads the same question content. The answer key stays outside the frontend
bundle and API task projection. This repository is public: the bank is study material, not a secret exam.

Each attempt deterministically selects five questions from each of two topic pools. Every pool holds six
questions per grade, so two variants differ in at most one question per topic and share at least 8 of 10. Backend supports
junior/middle/senior with Rust and PostgreSQL; frontend supports junior/middle with TypeScript and React.
The assessment id is the variant key, so idempotent replay returns the same task while separate attempts can
receive different balanced variants. Pass requires at least 8/10 overall and at least 3/5 in each subject.
These are explicit prototype thresholds, not a calibrated measurement of professional seniority. AI and
reference materials are allowed. A pass records knowledge on these topics, not practical coding experience,
identity assurance or competence across the whole stack.
Question explanations cite primary language, framework and database documentation. Fullstack and frontend
senior banks are not available.

The saved public task freezes version, grade, questions and options. Drafts may be partial; duplicate,
unknown or foreign selections and legacy free text are rejected. Submission requires all ten responses.
The evaluator rejects unknown or changed task versions and questions outside the selected specialization and
grade. Add a new immutable bank/evaluator when changing content; do not edit v1 after release. Results retain
checks and explanations as snapshots.

Before submission the checks endpoint reports completeness only, with no correct-answer hints. After
submission the result includes every question's outcome and explanation. The candidate lock orders draft,
consent and submission writes; the answer, result, grade and idempotency response commit atomically.
Failed attempts preserve the existing grade, skills and cooldown timestamp. Successful attempts retain
existing no-downgrade and 90-day successful-grade-change rules. Same-grade retries need no wait.

Old simulated code attempts remain readable. They cannot be edited or graded. Starting a new test retires
an unfinished legacy attempt atomically as `service_error`, with an explicit archived-format explanation,
without issuing a grade or penalty. Existing completed history and seeded demo grades remain historical
demonstration data; they are not retrospectively recertified by the new test.

Validation: domain bank integrity/privacy, reproducible distinct 5+5 variants and scoring; real PostgreSQL HTTP rejection/failure/pass/replay
and consent tests; component draft acknowledgement/failed-save recovery; browser answer selection,
reload, submission, grade preservation and result rendering. Production bundle checks forbid `correctOptionId`.

A same-grade pass refreshes the assessment freshness signal without restarting the grade-change cooldown.
The skill evidence resource references the successful attempt so the result page can observe completion.

`backend/experiments/assessment-variants-v2.json` is the machine-readable experiment record for variant
selection. It proves reproducibility, distinctness for the recorded keys and topic balance. It does not claim
test-retest reliability or grade separation: those require anonymized real response data and calibrated item
statistics. The product must not present the prototype thresholds as a benchmark until that study exists.
