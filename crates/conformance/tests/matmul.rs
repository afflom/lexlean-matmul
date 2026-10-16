//! Product conformance invokes the generated implementation and its independent oracle.

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
fn conformance_mm_01() {
    check("MM-01");
}

#[test]
fn conformance_mm_02() {
    check("MM-02");
}

#[test]
fn conformance_mm_03() {
    check("MM-03");
}

#[test]
fn conformance_mm_04() {
    check("MM-04");
}

#[test]
fn conformance_mm_05() {
    check("MM-05");
}

#[test]
fn conformance_mm_06() {
    check("MM-06");
}

#[test]
fn conformance_mm_07() {
    check("MM-07");
}

#[test]
fn conformance_mm_08() {
    check("MM-08");
}

#[test]
fn conformance_mm_09() {
    check("MM-09");
}

#[test]
fn conformance_mm_10() {
    check("MM-10");
}

#[test]
fn conformance_mm_11() {
    check("MM-11");
}

#[test]
fn conformance_mm_12() {
    check("MM-12");
}
