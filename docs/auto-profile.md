# Automatic profile and estimated category

Decided with the owner on 2026-10-10: a candidate fills in nothing. Connecting GitHub and/or the FSP account builds
the profile, and an estimate from that evidence gives the employer-visible category at once. A knowledge test is
optional and confirms the category; question banks cover every specialization and grade. The LLM (Grok through
Bifrost) assists. This document is the plan of record; [business rules](product/BUSINESS_RULES.md) change with each
delivered phase.

## Relation to the organizer's specification

The specification derives the category from «опрос по отрасли и специализации, самостоятельный выбор
предполагаемого грейда и тестирование на заявленный грейд» and ranks «по силе подтверждённого профиля»
(§2, p1; §2.1, p4). It also values automatic enrichment from FSP results and ML for categorization (§1; §3.2, p4–5).
The owner chose to let an evidence-based estimate assign the category as well. To stay inside the spirit of the
specification:

- the questionnaire still exists, answered by the system from evidence and visible to the candidate; any answer
  the candidate edits is kept and never overwritten;
- every category states its source: «подтверждено тестом» or «оценка по открытым данным» with its confidence;
- within a category, test-confirmed candidates rank above estimated ones, then by estimate confidence;
- a test result always replaces the estimate, and the estimate never lowers a confirmed grade.

## Catalog v2

One data file, `backend/crates/domain/data/catalog.json`, is the single source for Rust, the contract generator and
the mock; the frontend receives labels through the generated types and `/meta`.

- **Grades:** стажёр (intern), джуниор, мидл, сеньор, лид (lead), ordered.
- **Specializations (25):** backend, frontend, fullstack, iOS, Android, cross-platform mobile, DevOps/SRE, data
  engineering, data science and ML, ML engineering/MLOps, manual QA, test automation, information security,
  embedded and IoT, systems programming, game development, 1C development, ERP/SAP, system analysis, business
  analysis, data analytics/BI, database administration, system and network administration, UI/UX design, product
  and project management. Each names two test topics and the skills that indicate it.
- **Skills (~300):** languages (including the 1C language, ABAP, Delphi, COBOL, Verilog/VHDL), frameworks,
  databases, infrastructure, data/ML, mobile, QA, security, embedded, game engines, the 1C ecosystem (1С:Предприятие,
  БСП, СКД, query language, ERP/УТ/ЗУП/Бухгалтерия, обмены, EDT, 1С-Битрикс), ERP/SAP, analytics/BI, analysis
  notations, design tools and management practices. Each has a category and the specializations it indicates.
- GitHub detection maps its technologies and languages (including `.bsl`/`.os` 1C sources and 1C configuration
  dumps) to catalog skills, so evidence covers the whole catalog.

## Estimate (`estimate-v2`)

A pure domain function turns the GitHub report, FSP results and optional imported experience into an estimate:

- **Specialization:** shares from the candidate's own changed files by area and from the stack each specialization
  indicates; fullstack when backend and frontend both carry substantial shares. When the top two are close, the
  LLM review may choose between them.
- **Seniority score (0–100) → grade:** saturating, documented factors — sustained years of public work, led and
  maintained projects and own organizations, engineering practices, accepted work in independent projects and
  reviews of others, breadth and depth of the stack, consistency and volume (capped so volume alone never reaches
  senior), and FSP results (finals, places, individual versus team). Bands: < 20 intern, 20–39 junior, 40–59 middle,
  60–79 senior, ≥ 80 lead. Senior needs 24 months of public work or stated experience and lead 48, counted in
  months (`estimate-v2`; `estimate-v1` counted calendar years, so thirteen months across a new year passed as two).
- **Confidence** follows the amount and coverage of evidence; with too little public data the estimate says so and
  gives no category until a test or more evidence.
- **Profile answers:** industry IT, specialization, target grade = estimated grade, stack (top evidenced catalog
  skills), experience text and duration of public work, team role from ownership and collaboration, name from the
  public GitHub profile when the candidate has none.
- Every factor carries points and an explanation shown to the candidate; employers see the grade, confidence and
  the source.

### LLM assistance

Bifrost (Grok) receives the anonymized evidence (portrait, factors, project descriptions, FSP results) and returns,
validated against the catalog: a second opinion on specialization and grade with a short rationale, and the
experience and team-role texts. The category stays deterministic: the LLM may only choose between close
specializations, and a disagreement on the grade lowers the confidence one level and is shown. Without Bifrost the
rule-based estimate and template texts work alone.

## Category and search

- Effective category = confirmed (test) when present, otherwise the estimate with at least medium confidence.
- The bank, filters and ranking use the effective category; a «Подтверждение» filter separates test-confirmed and
  estimated categories. Skill-level confirmation still needs a test; GitHub and FSP give evidence.
- Visibility requires a verified e-mail, both consents and an effective category.

## Question banks

Every specialization has two topics and every grade six questions per topic, as the backend bank does: balanced
5+5 variants per attempt. Delivered as topic banks (`knowledge-v3-*.json`, 1,230 questions on 39 topics) shared by
the specializations tested on each topic; fullstack is tested on HTTP/REST API and SQL. Intern and lead extend the
existing junior–senior structure for Rust, PostgreSQL, TypeScript and React.

## Delivery phases

1. Catalog v2: data file, generated contract enums, Rust enums, labels, GitHub skill mapping, the mock image fix.
   Delivered in PR #73.
2. Estimate, automatic profile, estimated category, LLM review, onboarding and employer UI. Delivered on
   `feat/auto-profile`: `ProfileEstimate`, `autoFields` and `category.source/confidence` in the profile; the
   anonymous candidate carries the category, its source and confidence and the score with factor points;
   `POST /me/profile/estimate` recomputes; the bank filters by `categorySource`; applications and weekly tasks need a
   category (`category` reason); migration 0006 adds the estimate and auto-field columns. The source transaction
   applies the rules at once; the LLM review runs in the background after commit (live Grok answers took over 20
   seconds) and joins the estimate only if it is unchanged. The mock serves Rust-generated golden estimates.
3. Question banks for every specialization and grade. Delivered on `feat/knowledge-banks`.

Each phase goes through the usual gates and deployment; business rules, traceability and screenshots change with it.
