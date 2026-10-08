# Knowledge assessments

New attempts use `execution: questionnaire` and the immutable `knowledge-v1` bank in
`backend/crates/domain/data/knowledge-v1.json`. The Rust domain evaluator is authoritative;
the development HTTP mock reads the same question content. The answer key stays outside the frontend
bundle and API task projection. This repository is public: the bank is study material, not a secret exam.

Each backend grade has 10 single-choice questions: five Rust and five PostgreSQL. Pass requires at least
8/10 overall and at least 3/5 in each subject. These are explicit prototype thresholds, not a calibrated
measurement of professional seniority. AI and reference materials are allowed. A pass records knowledge
on these topics, not practical coding experience, identity assurance or competence across the whole stack.
Question explanations cite official Rust, Tokio and PostgreSQL 16 documentation. The content was reviewed
against those primary sources on 2026-10-08. Frontend/fullstack banks are not available.

The saved public task freezes version, grade, questions and options. Drafts may be partial; duplicate,
unknown or foreign selections and legacy free text are rejected. Submission requires all ten responses.
The evaluator rejects unknown or changed task versions. Add a new immutable bank/evaluator when changing
content; do not edit v1 after release. Results retain checks and explanations as snapshots.

Before submission the checks endpoint reports completeness only, with no correct-answer hints. After
submission the result includes every question's outcome and explanation. The candidate lock orders draft,
consent and submission writes; the answer, result, grade and idempotency response commit atomically.
Failed attempts preserve the existing grade, skills and cooldown timestamp. Successful attempts retain
existing no-downgrade and 90-day successful-grade-change rules. Same-grade retries need no wait.

Old simulated code attempts remain readable. They cannot be edited or graded. Starting a new test retires
an unfinished legacy attempt atomically as `service_error`, with an explicit archived-format explanation,
without issuing a grade or penalty. Existing completed history and seeded demo grades remain historical
demonstration data; they are not retrospectively recertified by the new test.

Validation: domain bank integrity/privacy and scoring; real PostgreSQL HTTP rejection/failure/pass/replay
and consent tests; component draft acknowledgement/failed-save recovery; browser answer selection,
reload, submission, grade preservation and result rendering. Production bundle checks forbid `correctOptionId`.

A same-grade pass refreshes the assessment freshness signal without restarting the grade-change cooldown.
The skill evidence resource references the successful attempt so the result page can observe completion.
