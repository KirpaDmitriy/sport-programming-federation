-- jobs.owner_id is a polymorphic owner key: candidate-owned jobs carry the
-- candidate id (new_job(candidate_id, ...)), employer-side jobs the company id.
-- jobs_owner_fk -> accounts(id) held only because seeded candidate accounts
-- reuse the candidate id as their account id; lazily-registered candidates get
-- actor-*/candidate-* pairs and every job insert violated the FK.
ALTER TABLE jobs DROP CONSTRAINT jobs_owner_fk;
