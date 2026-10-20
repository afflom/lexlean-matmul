//! Production requirements execute the generated workbench and independent browser oracles.

use std::path::Path;
use std::process::Command;

static BROWSER_OWNER: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn check(id: &str) {
    let _browser = BROWSER_OWNER
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root");
    let result = Command::new("node")
        .args(["scripts/conformance.mjs", id])
        .current_dir(root)
        .output()
        .expect("execute production acceptance");
    assert!(
        result.status.success(),
        "{id}: {}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn conformance_mm_18() {
    check("MM-18");
}

#[test]
fn conformance_mm_19() {
    check("MM-19");
}

#[test]
fn conformance_mm_20() {
    check("MM-20");
}

#[test]
fn conformance_mm_21() {
    check("MM-21");
}

#[test]
fn conformance_mm_22() {
    check("MM-22");
}

#[test]
fn conformance_mm_23() {
    check("MM-23");
}

#[test]
fn conformance_mm_24() {
    check("MM-24");
}
