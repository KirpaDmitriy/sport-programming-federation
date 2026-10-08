-- Keep issuance throttling independent of code attempts and provider success.
ALTER TABLE challenges ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX challenges_email_created_at ON challenges(email, created_at);
