//! Retained binaries may see newer, reviewed additive migrations after rollback.
//! Known checksums, dirty state and missing versions inside our history stay fatal.
use sqlx::PgPool;
use sqlx::migrate::{Migrate, MigrateError};

pub(crate) async fn run(pool: &PgPool) -> Result<(), MigrateError> {
    let mut migrator = sqlx::migrate!("./migrations");
    let latest = migrator
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or(0);
    // A detached connection closes even on cancellation/error: never return a
    // session-level advisory lock to the pool. Hold SQLx's lock across both checks.
    let mut connection = pool.acquire().await?.detach();
    connection.lock().await?;
    let result = async {
        connection.ensure_migrations_table().await?;
        for applied in connection.list_applied_migrations().await? {
            if applied.version <= latest && !migrator.version_exists(applied.version) {
                return Err(MigrateError::VersionMissing(applied.version));
            }
        }
        migrator.set_ignore_missing(true);
        migrator.set_locking(false);
        migrator.run(&mut connection).await
    }
    .await;
    let unlock = connection.unlock().await;
    result.and(unlock)
}
