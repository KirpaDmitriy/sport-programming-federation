import json
import sqlite3
from collections.abc import Iterable
from contextlib import contextmanager
from pathlib import Path

from app.domain.models import (
    Achievement,
    Candidate,
    Competition,
    EvidencePolicy,
    EvidencePolicyMode,
    Requirement,
    Skill,
    Vacancy,
)


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('candidate', 'employer')),
    display_name TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS email_verifications (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employer_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    description TEXT NOT NULL,
    industry TEXT NOT NULL,
    contact_method TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    prerequisites_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS competitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    discipline TEXT NOT NULL,
    source TEXT NOT NULL,
    participants INTEGER NOT NULL CHECK (participants >= 0),
    difficulty REAL NOT NULL CHECK (difficulty BETWEEN 0 AND 1),
    official INTEGER NOT NULL,
    skill_relevance_json TEXT NOT NULL,
    starts_on TEXT
);
CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    work_format TEXT NOT NULL,
    desired_role TEXT NOT NULL,
    about TEXT NOT NULL,
    stack_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS candidate_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
    industry TEXT NOT NULL,
    specialization TEXT NOT NULL,
    claimed_grade TEXT NOT NULL,
    verified_grade TEXT,
    grade_changed_at TEXT,
    fsp_id TEXT,
    contact_email TEXT NOT NULL,
    years_experience INTEGER NOT NULL CHECK (years_experience >= 0),
    roles_json TEXT NOT NULL,
    soft_skills_json TEXT NOT NULL,
    profile_visible INTEGER NOT NULL DEFAULT 0,
    consent_processing INTEGER NOT NULL DEFAULT 0,
    consent_publication INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS assessment_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    specialization TEXT NOT NULL,
    target_grade TEXT NOT NULL,
    question_ids_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
    score REAL,
    outcome TEXT,
    recommended_grade TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE TABLE IF NOT EXISTS assessment_answers (
    attempt_id TEXT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    selected_index INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    PRIMARY KEY (attempt_id, question_id)
);
CREATE TABLE IF NOT EXISTS candidate_test_skills (
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    attempt_id TEXT NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id),
    level REAL NOT NULL CHECK (level BETWEEN 0 AND 1),
    confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    PRIMARY KEY (candidate_id, skill_id)
);
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES candidates(id),
    competition_id TEXT NOT NULL REFERENCES competitions(id),
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    placement INTEGER NOT NULL CHECK (placement > 0),
    participants INTEGER NOT NULL CHECK (participants > 0),
    role TEXT NOT NULL,
    rank TEXT,
    UNIQUE (source, external_id)
);
CREATE TABLE IF NOT EXISTS vacancies (
    id TEXT PRIMARY KEY,
    employer TEXT NOT NULL,
    title TEXT NOT NULL,
    grade TEXT NOT NULL,
    work_format TEXT NOT NULL,
    salary_from INTEGER NOT NULL CHECK (salary_from > 0),
    salary_to INTEGER NOT NULL CHECK (salary_to >= salary_from),
    requirements_json TEXT NOT NULL,
    policy_mode TEXT NOT NULL,
    policy_competitions_json TEXT NOT NULL,
    specialization TEXT NOT NULL DEFAULT 'general',
    description TEXT NOT NULL DEFAULT '',
    team_description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS vacancy_owners (
    vacancy_id TEXT PRIMARY KEY REFERENCES vacancies(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id TEXT NOT NULL REFERENCES candidates(id),
    vacancy_id TEXT NOT NULL REFERENCES vacancies(id),
    salary_from INTEGER NOT NULL CHECK (salary_from > 0),
    salary_to INTEGER NOT NULL CHECK (salary_to >= salary_from),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    vacancy_id TEXT REFERENCES vacancies(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL,
    position_title TEXT NOT NULL,
    salary_from INTEGER NOT NULL CHECK (salary_from > 0),
    salary_to INTEGER NOT NULL CHECK (salary_to >= salary_from),
    description TEXT NOT NULL,
    contact_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'viewed', 'accepted', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (candidate_id, vacancy_id)
);
CREATE INDEX IF NOT EXISTS achievements_candidate_idx ON achievements(candidate_id);
CREATE INDEX IF NOT EXISTS offers_candidate_idx ON offers(candidate_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS invitations_candidate_idx ON invitations(candidate_id);
CREATE INDEX IF NOT EXISTS invitations_employer_idx ON invitations(employer_user_id);
CREATE INDEX IF NOT EXISTS applications_vacancy_idx ON applications(vacancy_id);
"""


class Store:
    def __init__(self, path: str | Path):
        self.path = str(path)

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.executescript(SCHEMA)
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(vacancies)")}
            for name, definition in (
                ("specialization", "TEXT NOT NULL DEFAULT 'general'"),
                ("description", "TEXT NOT NULL DEFAULT ''"),
                ("team_description", "TEXT NOT NULL DEFAULT ''"),
            ):
                if name not in columns:
                    connection.execute(f"ALTER TABLE vacancies ADD COLUMN {name} {definition}")

    def create_user(
        self,
        user_id: str,
        email: str,
        password_hash: str,
        role: str,
        display_name: str,
        verification_hash: str,
        verification_expires_at: str,
    ) -> dict:
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO users(id, email, password_hash, role, display_name)
                VALUES (?, ?, ?, ?, ?)""",
                (user_id, email, password_hash, role, display_name),
            )
            connection.execute(
                """INSERT INTO email_verifications(user_id, code_hash, expires_at)
                VALUES (?, ?, ?)""",
                (user_id, verification_hash, verification_expires_at),
            )
        return self.user(user_id)

    def user(self, user_id: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT id, email, password_hash, role, display_name, email_verified, created_at
                FROM users WHERE id = ?""",
                (user_id,),
            ).fetchone()
        return dict(row) if row else None

    def user_by_email(self, email: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT id, email, password_hash, role, display_name, email_verified, created_at
                FROM users WHERE email = ?""",
                (email,),
            ).fetchone()
        return dict(row) if row else None

    def delete_user(self, user_id: str) -> None:
        with self.connection() as connection:
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))

    def verification(self, user_id: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT * FROM email_verifications WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return dict(row) if row else None

    def record_verification_failure(self, user_id: str) -> None:
        with self.connection() as connection:
            connection.execute(
                "UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?",
                (user_id,),
            )

    def verify_user(self, user_id: str) -> None:
        with self.connection() as connection:
            connection.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
            connection.execute("DELETE FROM email_verifications WHERE user_id = ?", (user_id,))

    def create_session(self, token_hash: str, user_id: str, expires_at: str) -> None:
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (token_hash, user_id, expires_at),
            )

    def user_for_session(self, token_hash: str, now: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT users.id, users.email, users.password_hash, users.role,
                users.display_name, users.email_verified, users.created_at
                FROM sessions JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
                (token_hash, now),
            ).fetchone()
        return dict(row) if row else None

    def delete_session(self, token_hash: str) -> None:
        with self.connection() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def delete_expired_sessions(self, now: str) -> None:
        with self.connection() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))

    def _executemany(self, query: str, rows: list[tuple], connection: sqlite3.Connection | None = None) -> None:
        if connection is not None:
            connection.executemany(query, rows)
            return
        with self.connection() as own_connection:
            own_connection.executemany(query, rows)

    def upsert_skills(self, skills: Iterable[Skill], connection: sqlite3.Connection | None = None) -> None:
        rows = [(s.id, s.name, s.category, json.dumps(s.prerequisites)) for s in skills]
        self._executemany(
            """INSERT INTO skills VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,
            category=excluded.category, prerequisites_json=excluded.prerequisites_json""",
            rows,
            connection,
        )

    def upsert_competitions(self, competitions: Iterable[Competition], connection: sqlite3.Connection | None = None) -> None:
        rows = [
            (
                item.id,
                item.name,
                item.discipline,
                item.source,
                item.participants,
                item.difficulty,
                item.official,
                json.dumps(item.skill_relevance, ensure_ascii=False),
                item.starts_on.isoformat() if item.starts_on else None,
            )
            for item in competitions
        ]
        self._executemany(
            """INSERT INTO competitions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,
            discipline=excluded.discipline, source=excluded.source,
            participants=excluded.participants, difficulty=excluded.difficulty,
            official=excluded.official, skill_relevance_json=excluded.skill_relevance_json,
            starts_on=excluded.starts_on""",
            rows,
            connection,
        )

    def upsert_candidates(self, candidates: Iterable[Candidate], connection: sqlite3.Connection | None = None) -> None:
        rows = [
            (c.id, c.name, c.city, c.work_format, c.desired_role, c.about, json.dumps(c.stack, ensure_ascii=False))
            for c in candidates
        ]
        self._executemany(
            """INSERT INTO candidates VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, city=excluded.city,
            work_format=excluded.work_format, desired_role=excluded.desired_role,
            about=excluded.about, stack_json=excluded.stack_json""",
            rows,
            connection,
        )

    def save_candidate_profile(self, user_id: str, candidate: Candidate, profile: dict) -> None:
        with self.connection() as connection:
            self.upsert_candidates([candidate], connection)
            connection.execute(
                """INSERT INTO candidate_profiles(
                    user_id, candidate_id, industry, specialization, claimed_grade,
                    verified_grade, grade_changed_at, fsp_id, contact_email,
                    years_experience, roles_json, soft_skills_json, profile_visible,
                    consent_processing, consent_publication, updated_at
                ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    industry=excluded.industry,
                    specialization=excluded.specialization,
                    claimed_grade=excluded.claimed_grade,
                    fsp_id=excluded.fsp_id,
                    contact_email=excluded.contact_email,
                    years_experience=excluded.years_experience,
                    roles_json=excluded.roles_json,
                    soft_skills_json=excluded.soft_skills_json,
                    profile_visible=excluded.profile_visible,
                    consent_processing=excluded.consent_processing,
                    consent_publication=excluded.consent_publication,
                    updated_at=CURRENT_TIMESTAMP""",
                (
                    user_id,
                    candidate.id,
                    profile["industry"],
                    profile["specialization"],
                    profile["claimed_grade"],
                    profile.get("fsp_id"),
                    profile["contact_email"],
                    profile["years_experience"],
                    json.dumps(profile["roles"], ensure_ascii=False),
                    json.dumps(profile["soft_skills"], ensure_ascii=False),
                    int(profile["profile_visible"]),
                    int(profile["consent_processing"]),
                    int(profile["consent_publication"]),
                ),
            )

    def candidate_profile(self, user_id: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT candidate_profiles.*, candidates.name, candidates.city,
                candidates.work_format, candidates.desired_role, candidates.about,
                candidates.stack_json
                FROM candidate_profiles
                JOIN candidates ON candidates.id = candidate_profiles.candidate_id
                WHERE candidate_profiles.user_id = ?""",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["stack"] = json.loads(result.pop("stack_json"))
        result["roles"] = json.loads(result.pop("roles_json"))
        result["soft_skills"] = json.loads(result.pop("soft_skills_json"))
        for field in ("profile_visible", "consent_processing", "consent_publication"):
            result[field] = bool(result[field])
        return result

    def candidate_profile_by_candidate(self, candidate_id: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT * FROM candidate_profiles WHERE candidate_id = ?",
                (candidate_id,),
            ).fetchone()
        return dict(row) if row else None

    def save_employer_profile(self, user_id: str, profile: dict) -> None:
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO employer_profiles(
                    user_id, company_name, description, industry, contact_method, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    company_name=excluded.company_name,
                    description=excluded.description,
                    industry=excluded.industry,
                    contact_method=excluded.contact_method,
                    updated_at=CURRENT_TIMESTAMP""",
                (
                    user_id,
                    profile["company_name"],
                    profile["description"],
                    profile["industry"],
                    profile["contact_method"],
                ),
            )

    def employer_profile(self, user_id: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT * FROM employer_profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return dict(row) if row else None

    def create_assessment_attempt(
        self,
        attempt_id: str,
        user_id: str,
        candidate_id: str,
        specialization: str,
        target_grade: str,
        question_ids: list[str],
        started_at: str,
    ) -> None:
        with self.connection() as connection:
            connection.execute(
                """INSERT INTO assessment_attempts(
                    id, user_id, candidate_id, specialization, target_grade,
                    question_ids_json, status, started_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)""",
                (
                    attempt_id,
                    user_id,
                    candidate_id,
                    specialization,
                    target_grade,
                    json.dumps(question_ids),
                    started_at,
                ),
            )

    def assessment_attempt(self, attempt_id: str, user_id: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT * FROM assessment_attempts WHERE id = ? AND user_id = ?",
                (attempt_id, user_id),
            ).fetchone()
        if row is None:
            return None
        result = dict(row)
        result["question_ids"] = json.loads(result.pop("question_ids_json"))
        return result

    def complete_assessment(
        self,
        attempt_id: str,
        user_id: str,
        target_grade: str,
        answers: dict[str, int],
        result: dict,
        completed_at: str,
    ) -> None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT candidate_id, status FROM assessment_attempts
                WHERE id = ? AND user_id = ?""",
                (attempt_id, user_id),
            ).fetchone()
            if row is None or row["status"] != "active":
                raise ValueError("Assessment is missing or already completed")
            connection.executemany(
                """INSERT INTO assessment_answers(
                    attempt_id, question_id, selected_index, correct
                ) VALUES (?, ?, ?, ?)""",
                [
                    (attempt_id, question_id, selected_index, int(result["correct"][question_id]))
                    for question_id, selected_index in answers.items()
                ],
            )
            connection.execute(
                """UPDATE assessment_attempts SET status='completed', score=?, outcome=?,
                recommended_grade=?, completed_at=? WHERE id=?""",
                (
                    result["score"],
                    result["outcome"],
                    result["recommended_grade"],
                    completed_at,
                    attempt_id,
                ),
            )
            if result["passed"]:
                connection.executemany(
                    """INSERT INTO candidate_test_skills(
                        candidate_id, attempt_id, skill_id, level, confidence
                    ) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(candidate_id, skill_id) DO UPDATE SET
                        attempt_id=excluded.attempt_id,
                        level=excluded.level,
                        confidence=excluded.confidence""",
                    [
                        (
                            row["candidate_id"],
                            attempt_id,
                            skill_id,
                            signal["level"],
                            signal["confidence"],
                        )
                        for skill_id, signal in result["skill_signals"].items()
                    ],
                )
                connection.execute(
                    """UPDATE candidate_profiles SET
                    verified_grade=?,
                    grade_changed_at=CASE
                        WHEN verified_grade IS NULL OR verified_grade != ? THEN ?
                        ELSE grade_changed_at
                    END,
                    updated_at=CURRENT_TIMESTAMP
                    WHERE user_id=?""",
                    (target_grade, target_grade, completed_at, user_id),
                )

    def assessment_history(self, user_id: str) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT id, specialization, target_grade, status, score, outcome,
                recommended_grade, started_at, completed_at
                FROM assessment_attempts WHERE user_id = ? ORDER BY started_at DESC""",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def test_skill_signals(self, candidate_id: str) -> dict[str, tuple[float, float, str]]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT skill_id, level, confidence, attempt_id
                FROM candidate_test_skills WHERE candidate_id = ?""",
                (candidate_id,),
            ).fetchall()
        return {
            row["skill_id"]: (row["level"], row["confidence"], f"test:{row['attempt_id']}")
            for row in rows
        }

    def create_invitation(self, employer_user_id: str, candidate_id: str, invitation: dict) -> int:
        with self.connection() as connection:
            cursor = connection.execute(
                """INSERT INTO invitations(
                    employer_user_id, candidate_id, vacancy_id, company_name,
                    position_title, salary_from, salary_to, description, contact_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    employer_user_id,
                    candidate_id,
                    invitation.get("vacancy_id"),
                    invitation["company_name"],
                    invitation["position_title"],
                    invitation["salary_from"],
                    invitation["salary_to"],
                    invitation["description"],
                    invitation["contact_method"],
                ),
            )
            return int(cursor.lastrowid)

    def invitation(self, invitation_id: int) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT * FROM invitations WHERE id = ?",
                (invitation_id,),
            ).fetchone()
        return dict(row) if row else None

    def employer_invitations(self, user_id: str) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT invitations.*, candidates.name AS candidate_name,
                CASE WHEN invitations.status = 'accepted' THEN candidate_profiles.contact_email END
                    AS candidate_contact
                FROM invitations
                JOIN candidates ON candidates.id = invitations.candidate_id
                LEFT JOIN candidate_profiles ON candidate_profiles.candidate_id = invitations.candidate_id
                WHERE invitations.employer_user_id = ? ORDER BY invitations.id DESC""",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def candidate_invitations(self, user_id: str, mark_viewed: bool = False) -> list[dict]:
        with self.connection() as connection:
            profile = connection.execute(
                "SELECT candidate_id FROM candidate_profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if profile is None:
                return []
            if mark_viewed:
                connection.execute(
                    """UPDATE invitations SET status='viewed', updated_at=CURRENT_TIMESTAMP
                    WHERE candidate_id = ? AND status = 'sent'""",
                    (profile["candidate_id"],),
                )
            rows = connection.execute(
                """SELECT invitations.* FROM invitations
                WHERE candidate_id = ? ORDER BY id DESC""",
                (profile["candidate_id"],),
            ).fetchall()
        return [dict(row) for row in rows]

    def set_invitation_status(self, invitation_id: int, user_id: str, new_status: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT invitations.* FROM invitations
                JOIN candidate_profiles ON candidate_profiles.candidate_id = invitations.candidate_id
                WHERE invitations.id = ? AND candidate_profiles.user_id = ?""",
                (invitation_id, user_id),
            ).fetchone()
            if row is None:
                return None
            if row["status"] not in {"sent", "viewed"}:
                raise ValueError("Invitation already has a final status")
            connection.execute(
                """UPDATE invitations SET status = ?, updated_at=CURRENT_TIMESTAMP
                WHERE id = ?""",
                (new_status, invitation_id),
            )
            updated = connection.execute(
                "SELECT * FROM invitations WHERE id = ?",
                (invitation_id,),
            ).fetchone()
        return dict(updated)

    def create_application(self, user_id: str, candidate_id: str, vacancy_id: str, message: str) -> int:
        with self.connection() as connection:
            cursor = connection.execute(
                """INSERT INTO applications(candidate_user_id, candidate_id, vacancy_id, message)
                VALUES (?, ?, ?, ?)""",
                (user_id, candidate_id, vacancy_id, message),
            )
            return int(cursor.lastrowid)

    def candidate_applications(self, user_id: str) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT applications.*, vacancies.title, vacancies.employer,
                vacancies.salary_from, vacancies.salary_to
                FROM applications JOIN vacancies ON vacancies.id = applications.vacancy_id
                WHERE applications.candidate_user_id = ? ORDER BY applications.id DESC""",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def employer_applications(self, user_id: str, mark_viewed: bool = False) -> list[dict]:
        with self.connection() as connection:
            if mark_viewed:
                connection.execute(
                    """UPDATE applications SET status='viewed', updated_at=CURRENT_TIMESTAMP
                    WHERE status='submitted' AND vacancy_id IN (
                        SELECT vacancy_id FROM vacancy_owners WHERE user_id = ?
                    )""",
                    (user_id,),
                )
            rows = connection.execute(
                """SELECT applications.*, vacancies.title, candidates.name AS candidate_name,
                candidate_profiles.contact_email AS candidate_contact
                FROM applications
                JOIN vacancy_owners ON vacancy_owners.vacancy_id = applications.vacancy_id
                JOIN vacancies ON vacancies.id = applications.vacancy_id
                JOIN candidates ON candidates.id = applications.candidate_id
                JOIN candidate_profiles ON candidate_profiles.candidate_id = applications.candidate_id
                WHERE vacancy_owners.user_id = ? ORDER BY applications.id DESC""",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def set_application_status(self, application_id: int, user_id: str, new_status: str) -> dict | None:
        with self.connection() as connection:
            row = connection.execute(
                """SELECT applications.* FROM applications
                JOIN vacancy_owners ON vacancy_owners.vacancy_id = applications.vacancy_id
                WHERE applications.id = ? AND vacancy_owners.user_id = ?""",
                (application_id, user_id),
            ).fetchone()
            if row is None:
                return None
            if row["status"] in {"accepted", "rejected"}:
                raise ValueError("Application already has a final status")
            connection.execute(
                """UPDATE applications SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                (new_status, application_id),
            )
            updated = connection.execute(
                "SELECT * FROM applications WHERE id = ?", (application_id,),
            ).fetchone()
        return dict(updated)

    def upsert_achievements(self, achievements: Iterable[Achievement], connection: sqlite3.Connection | None = None) -> None:
        rows = [
            (
                a.id,
                a.candidate_id,
                a.competition_id,
                a.source,
                a.external_id,
                a.placement,
                a.participants,
                a.role,
                a.rank,
            )
            for a in achievements
        ]
        self._executemany(
            """INSERT INTO achievements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, external_id) DO UPDATE SET
            candidate_id=excluded.candidate_id, competition_id=excluded.competition_id,
            placement=excluded.placement, participants=excluded.participants,
            role=excluded.role, rank=excluded.rank""",
            rows,
            connection,
        )

    def upsert_vacancies(self, vacancies: Iterable[Vacancy], owner_user_id: str | None = None) -> None:
        vacancies = list(vacancies)
        rows = [
            (
                v.id,
                v.employer,
                v.title,
                v.grade,
                v.work_format,
                v.salary_from,
                v.salary_to,
                json.dumps([vars(item) for item in v.requirements], ensure_ascii=False),
                v.evidence_policy.mode,
                json.dumps(sorted(v.evidence_policy.competition_ids)),
                v.specialization,
                v.description,
                v.team_description,
            )
            for v in vacancies
        ]
        with self.connection() as connection:
            connection.executemany(
                """INSERT INTO vacancies(
                    id, employer, title, grade, work_format, salary_from, salary_to,
                    requirements_json, policy_mode, policy_competitions_json,
                    specialization, description, team_description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET employer=excluded.employer, title=excluded.title,
                grade=excluded.grade, work_format=excluded.work_format,
                salary_from=excluded.salary_from, salary_to=excluded.salary_to,
                requirements_json=excluded.requirements_json, policy_mode=excluded.policy_mode,
                policy_competitions_json=excluded.policy_competitions_json,
                specialization=excluded.specialization, description=excluded.description,
                team_description=excluded.team_description""",
                rows,
            )
            if owner_user_id:
                connection.executemany(
                    """INSERT INTO vacancy_owners(vacancy_id, user_id) VALUES (?, ?)
                    ON CONFLICT(vacancy_id) DO UPDATE SET user_id=excluded.user_id""",
                    [(vacancy.id, owner_user_id) for vacancy in vacancies],
                )

    def vacancy_owner(self, vacancy_id: str) -> str | None:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT user_id FROM vacancy_owners WHERE vacancy_id = ?",
                (vacancy_id,),
            ).fetchone()
        return row["user_id"] if row else None

    def owned_vacancies(self, user_id: str) -> list[Vacancy]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT vacancies.* FROM vacancies
                JOIN vacancy_owners ON vacancy_owners.vacancy_id = vacancies.id
                WHERE vacancy_owners.user_id = ? ORDER BY vacancies.title""",
                (user_id,),
            ).fetchall()
        return [self._vacancy(row) for row in rows]

    def skills(self) -> dict[str, Skill]:
        with self.connection() as connection:
            rows = connection.execute("SELECT * FROM skills ORDER BY id").fetchall()
        return {
            row["id"]: Skill(row["id"], row["name"], row["category"], tuple(json.loads(row["prerequisites_json"])))
            for row in rows
        }

    def competitions(self) -> dict[str, Competition]:
        from datetime import date

        with self.connection() as connection:
            rows = connection.execute("SELECT * FROM competitions ORDER BY id").fetchall()
        return {
            row["id"]: Competition(
                row["id"],
                row["name"],
                row["discipline"],
                row["source"],
                row["participants"],
                row["difficulty"],
                bool(row["official"]),
                json.loads(row["skill_relevance_json"]),
                date.fromisoformat(row["starts_on"]) if row["starts_on"] else None,
            )
            for row in rows
        }

    def candidates(self) -> list[Candidate]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT candidates.* FROM candidates
                LEFT JOIN candidate_profiles ON candidate_profiles.candidate_id = candidates.id
                WHERE candidate_profiles.user_id IS NULL
                   OR (candidate_profiles.profile_visible = 1
                       AND candidate_profiles.consent_processing = 1
                       AND candidate_profiles.consent_publication = 1)
                ORDER BY candidates.name"""
            ).fetchall()
        return [
            Candidate(
                row["id"], row["name"], row["city"], row["work_format"], row["desired_role"],
                row["about"], tuple(json.loads(row["stack_json"])),
            )
            for row in rows
        ]

    def candidate(self, candidate_id: str) -> Candidate | None:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
        if row is None:
            return None
        return Candidate(
            row["id"], row["name"], row["city"], row["work_format"], row["desired_role"],
            row["about"], tuple(json.loads(row["stack_json"])),
        )

    def achievements(self, candidate_id: str | None = None) -> list[Achievement]:
        query = "SELECT * FROM achievements"
        parameters: tuple[str, ...] = ()
        if candidate_id:
            query += " WHERE candidate_id = ?"
            parameters = (candidate_id,)
        query += " ORDER BY id"
        with self.connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [
            Achievement(
                row["id"], row["candidate_id"], row["competition_id"], row["source"],
                row["external_id"], row["placement"], row["participants"], row["role"], row["rank"],
            )
            for row in rows
        ]

    def vacancies(self) -> list[Vacancy]:
        with self.connection() as connection:
            rows = connection.execute("SELECT * FROM vacancies ORDER BY title").fetchall()
        return [self._vacancy(row) for row in rows]

    def vacancy(self, vacancy_id: str) -> Vacancy | None:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM vacancies WHERE id = ?", (vacancy_id,)).fetchone()
        return self._vacancy(row) if row else None

    @staticmethod
    def _vacancy(row: sqlite3.Row) -> Vacancy:
        requirements = tuple(Requirement(**item) for item in json.loads(row["requirements_json"]))
        policy = EvidencePolicy(
            EvidencePolicyMode(row["policy_mode"]),
            frozenset(json.loads(row["policy_competitions_json"])),
        )
        return Vacancy(
            row["id"], row["employer"], row["title"], row["grade"], row["work_format"],
            row["salary_from"], row["salary_to"], requirements, policy,
            row["specialization"], row["description"], row["team_description"],
        )

    def create_offer(
        self,
        candidate_id: str,
        vacancy_id: str,
        salary_from: int,
        salary_to: int,
        message: str,
    ) -> int:
        with self.connection() as connection:
            cursor = connection.execute(
                """INSERT INTO offers(candidate_id, vacancy_id, salary_from, salary_to, message)
                VALUES (?, ?, ?, ?, ?)""",
                (candidate_id, vacancy_id, salary_from, salary_to, message),
            )
            return int(cursor.lastrowid)

    def offers(self, candidate_id: str) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                """SELECT offers.*, vacancies.title, vacancies.employer
                FROM offers JOIN vacancies ON vacancies.id = offers.vacancy_id
                WHERE candidate_id = ? ORDER BY offers.id DESC""",
                (candidate_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def count(self, table: str) -> int:
        if table not in {
            "users", "sessions", "candidate_profiles", "employer_profiles",
            "assessment_attempts", "candidate_test_skills", "skills", "competitions",
            "candidates", "achievements", "vacancies", "offers", "invitations", "applications",
        }:
            raise ValueError("Unknown table")
        with self.connection() as connection:
            return int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
