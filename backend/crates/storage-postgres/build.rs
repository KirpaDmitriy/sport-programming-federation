fn main() {
    // sqlx::migrate! embeds SQL at compile time; migration-only edits must
    // invalidate Cargo's cache without touching an unrelated Rust source file.
    println!("cargo:rerun-if-changed=migrations");
}
