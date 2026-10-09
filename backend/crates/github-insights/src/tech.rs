//! Catalog technology detection from repository artifacts.
//!
//! A technology counts only with a concrete artifact: a language share of the code, a declared
//! dependency in `Cargo.toml` or `package.json`, a container file, or an explicit topic. Signals are
//! kept as short reasons so the candidate can see why a technology was attributed.

use std::collections::{BTreeMap, BTreeSet};

use crate::snapshot::PrimaryRepository;

/// Detected catalog skill id → human-readable reasons.
pub type Detected = BTreeMap<&'static str, BTreeSet<String>>;

const POSTGRES_RUST: &[&str] = &[
    "tokio-postgres",
    "postgres",
    "deadpool-postgres",
    "bb8-postgres",
    "postgres-types",
    "cornucopia",
    "clorinde",
];
const REDIS_RUST: &[&str] = &["redis", "deadpool-redis", "bb8-redis", "fred", "mobc-redis"];
const POSTGRES_NPM: &[&str] = &[
    "pg",
    "postgres",
    "pg-promise",
    "@neondatabase/serverless",
    "@vercel/postgres",
    "slonik",
];
const REDIS_NPM: &[&str] = &[
    "redis",
    "ioredis",
    "@upstash/redis",
    "@redis/client",
    "bullmq",
];
const REACT_NPM: &[&str] = &[
    "react",
    "react-dom",
    "next",
    "react-native",
    "@remix-run/react",
];
const CONTAINER_FILES: &[&str] = &[
    "dockerfile",
    "containerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
];

pub fn detect(repository: &PrimaryRepository) -> Detected {
    let mut found = Detected::new();
    let mut add = |skill: &'static str, reason: String| {
        found.entry(skill).or_default().insert(reason);
    };
    let total: u64 = repository.languages.iter().map(|(_, size)| size).sum();
    for (language, size) in &repository.languages {
        let percent = (size * 100).checked_div(total).unwrap_or(0);
        match language.as_str() {
            "Rust" if percent >= 10 => add("rust", format!("Rust — {percent}% кода")),
            "TypeScript" if percent >= 10 => {
                add("typescript", format!("TypeScript — {percent}% кода"));
            }
            "PLpgSQL" => add("postgresql", "код на PL/pgSQL".into()),
            "Dockerfile" => add("docker", "Dockerfile в языках репозитория".into()),
            _ => {}
        }
    }
    for topic in &repository.topics {
        let skill = match topic.to_ascii_lowercase().as_str() {
            "rust" | "rust-lang" => "rust",
            "postgresql" | "postgres" => "postgresql",
            "docker" | "docker-compose" => "docker",
            "redis" => "redis",
            "typescript" => "typescript",
            "react" | "reactjs" | "nextjs" => "react",
            _ => continue,
        };
        add(skill, format!("тема репозитория «{topic}»"));
    }
    for (name, _) in &repository.root {
        let lower = name.to_ascii_lowercase();
        if CONTAINER_FILES.contains(&lower.as_str()) {
            add("docker", format!("файл {name}"));
        }
        if lower == "tsconfig.json" {
            add("typescript", "tsconfig.json".into());
        }
    }
    if let Some(manifest) = &repository.cargo_manifest {
        add("rust", "Cargo.toml".into());
        for (name, features) in cargo_dependencies(manifest) {
            let postgres_feature = features.iter().any(|feature| feature.contains("postgres"));
            if POSTGRES_RUST.contains(&name.as_str())
                || (["sqlx", "diesel", "sea-orm", "refinery"].contains(&name.as_str())
                    && postgres_feature)
            {
                add("postgresql", format!("Cargo.toml: {name}"));
            }
            if REDIS_RUST.contains(&name.as_str()) {
                add("redis", format!("Cargo.toml: {name}"));
            }
        }
    }
    if let Some(manifest) = &repository.npm_manifest {
        for name in npm_dependencies(manifest) {
            if POSTGRES_NPM.contains(&name.as_str()) {
                add("postgresql", format!("package.json: {name}"));
            }
            if REDIS_NPM.contains(&name.as_str()) {
                add("redis", format!("package.json: {name}"));
            }
            if REACT_NPM.contains(&name.as_str()) {
                add("react", format!("package.json: {name}"));
            }
            if name == "typescript" {
                add("typescript", "package.json: typescript".into());
            }
        }
    }
    found
}

/// Dependency names (after `package` renames) with their enabled features, from every dependency
/// table including workspace and target-specific ones.
pub fn cargo_dependencies(manifest: &str) -> Vec<(String, Vec<String>)> {
    let Ok(value) = manifest.parse::<toml::Table>() else {
        return Vec::new();
    };
    let mut tables = Vec::new();
    for key in ["dependencies", "dev-dependencies", "build-dependencies"] {
        tables.extend(value.get(key).and_then(toml::Value::as_table));
    }
    if let Some(workspace) = value.get("workspace").and_then(toml::Value::as_table) {
        tables.extend(
            workspace
                .get("dependencies")
                .and_then(toml::Value::as_table),
        );
    }
    if let Some(targets) = value.get("target").and_then(toml::Value::as_table) {
        for target in targets.values().filter_map(toml::Value::as_table) {
            for key in ["dependencies", "dev-dependencies", "build-dependencies"] {
                tables.extend(target.get(key).and_then(toml::Value::as_table));
            }
        }
    }
    let mut dependencies = Vec::new();
    for table in tables {
        for (key, spec) in table {
            let name = spec
                .get("package")
                .and_then(toml::Value::as_str)
                .unwrap_or(key)
                .to_owned();
            let features = spec
                .get("features")
                .and_then(toml::Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(toml::Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            dependencies.push((name, features));
        }
    }
    dependencies
}

pub fn npm_dependencies(manifest: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(manifest) else {
        return Vec::new();
    };
    let mut names = BTreeSet::new();
    for key in [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
    ] {
        if let Some(object) = value.get(key).and_then(serde_json::Value::as_object) {
            names.extend(object.keys().cloned());
        }
    }
    names.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cargo_tables_renames_and_features_are_read() {
        let manifest = r#"
[package]
name = "demo"
[dependencies]
sqlx = { version = "0.8", features = ["postgres", "runtime-tokio"] }
cache = { package = "redis", version = "0.27" }
serde = "1"
[workspace.dependencies]
tokio-postgres = "0.7"
[target.'cfg(unix)'.dev-dependencies]
diesel = { version = "2", features = ["sqlite"] }
"#;
        let repository = PrimaryRepository {
            cargo_manifest: Some(manifest.into()),
            ..PrimaryRepository::default()
        };
        let found = detect(&repository);
        assert_eq!(
            found.keys().copied().collect::<Vec<_>>(),
            ["postgresql", "redis", "rust"]
        );
        assert!(found["postgresql"].contains("Cargo.toml: sqlx"));
        assert!(found["postgresql"].contains("Cargo.toml: tokio-postgres"));
        assert!(
            !found["postgresql"]
                .iter()
                .any(|reason| reason.contains("diesel"))
        );
    }

    #[test]
    fn npm_languages_files_and_topics_need_a_concrete_artifact() {
        let repository = PrimaryRepository {
            npm_manifest: Some(
                r#"{"dependencies":{"react":"19","ioredis":"5"},"devDependencies":{"typescript":"7"}}"#
                    .into(),
            ),
            languages: vec![("TypeScript".into(), 95), ("CSS".into(), 5)],
            root: vec![("Dockerfile".into(), false), ("src".into(), true)],
            topics: vec!["PostgreSQL".into(), "web".into()],
            ..PrimaryRepository::default()
        };
        let found = detect(&repository);
        assert_eq!(
            found.keys().copied().collect::<Vec<_>>(),
            ["docker", "postgresql", "react", "redis", "typescript"]
        );
        let tiny_rust = PrimaryRepository {
            languages: vec![("Rust".into(), 5), ("Python".into(), 95)],
            ..PrimaryRepository::default()
        };
        assert!(detect(&tiny_rust).is_empty());
    }
}
