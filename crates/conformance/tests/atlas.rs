//! Canonical Laurent atom contraction executes the generated IEEE implementation.

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
        .expect("execute product acceptance");
    assert!(
        result.status.success(),
        "{id}: {}{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn conformance_mm_16() {
    check("MM-16");
}
