-- Preserve previous source snapshots while adding explicit fictional result provenance.
ALTER TABLE sources ADD COLUMN fsp_results_json TEXT NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(fsp_results_json::jsonb) = 'array');
