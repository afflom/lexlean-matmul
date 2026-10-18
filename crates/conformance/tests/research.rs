//! Research requirements execute the generated guest and independent browser oracles.

use std::path::Path;
use std::process::Command;

fn check(id: &str) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root");
    let result = Command::new("node")
        .args(["scripts/conformance.mjs", id])
        .current_dir(root)
        .output()
        .expect("execute research acceptance");
    assert!(
        result.status.success(),
        "{id}: {}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn conformance_mm_25() {
    check("MM-25");
}

#[test]
fn conformance_mm_26() {
    check("MM-26");
}

#[test]
fn conformance_mm_27() {
    check("MM-27");
}

#[test]
fn conformance_mm_28() {
    check("MM-28");
}

#[test]
fn conformance_mm_29() {
    check("MM-29");
}

#[test]
fn conformance_mm_30() {
    check("MM-30");
}

#[test]
fn conformance_mm_31() {
    check("MM-31");
}
