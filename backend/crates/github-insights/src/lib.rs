//! Public GitHub activity analysis.
//!
//! A separate loopback service: it collects public facts about one account ([`collect`]), turns them
//! into documented heuristics and scores ([`analysis`]) and serves the report to the career API
//! ([`http`]). Only public repositories are analyzed, whatever the configured token can access.

pub mod analysis;
pub mod client;
pub mod collect;
pub mod http;
pub mod snapshot;
pub mod tech;

pub use http::{InsightsState, router};
