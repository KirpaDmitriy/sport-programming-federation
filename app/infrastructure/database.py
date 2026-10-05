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
    policy_competitions_json TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS achievements_candidate_idx ON achievements(candidate_id);
CREATE INDEX IF NOT EXISTS offers_candidate_idx ON offers(candidate_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
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

    def upsert_vacancies(self, vacancies: Iterable[Vacancy]) -> None:
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
            )
            for v in vacancies
        ]
        with self.connection() as connection:
            connection.executemany(
                """INSERT INTO vacancies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET employer=excluded.employer, title=excluded.title,
                grade=excluded.grade, work_format=excluded.work_format,
                salary_from=excluded.salary_from, salary_to=excluded.salary_to,
                requirements_json=excluded.requirements_json, policy_mode=excluded.policy_mode,
                policy_competitions_json=excluded.policy_competitions_json""",
                rows,
            )

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
            rows = connection.execute("SELECT * FROM candidates ORDER BY name").fetchall()
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
            "users", "sessions", "skills", "competitions", "candidates",
            "achievements", "vacancies", "offers",
        }:
            raise ValueError("Unknown table")
        with self.connection() as connection:
            return int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
