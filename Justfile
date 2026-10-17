# `just vv` is the normative acceptance gate. Everything else is a slice of it.

default: vv

# The whole gate.
vv: template-check fmt-check model lint product-build product-reproducibility test features bdd deny product-mutations
    node scripts/acceptance.mjs
    @echo "vv: the acceptance gate passed"

# R1, R4, R5 --- the repository gates, each falsifiable.
model:
    cargo run -q -p xtask -- validate
    node --test scripts/acceptance-vectors.test.mjs
    node --test scripts/evidence-custody.test.mjs
    node scripts/project-policy.mjs

# The hand-reviewed trust root is checked independently of generated project
# content. PrismPM then validates the canonical contract and both locks.
template-check:
    cargo run -q -p xtask -- check-model
    cargo run -q -p xtask -- audit-bootstrap
    prismpm template check
    prismpm lock check

# Regenerate everything the model owns: CONFORMANCE.md.
model-write:
    cargo run -q -p xtask -- check-model --write
    node scripts/write-errors.mjs --write

fmt:
    cargo fmt --all

fmt-check:
    cargo fmt --all -- --check

lint:
    cargo clippy --workspace --all-targets -- -D warnings

test:
    cargo test --workspace

# A feature only its author has built is a feature that does not work: nothing
# else in the gate compiles a crate at anything but its default features, so a
# rename upstream of an optional dependency fails nowhere until someone turns
# the flag on. `--all-targets` because the tests behind a flag are code too.
#
# Every optional feature compiles, with its tests.
features:
    cargo check --workspace --all-features --all-targets

# R3: every capability begins as a Gherkin scenario, and every scenario has a
# test whose name ends in its ID.
bdd:
    cargo test -p repo-conformance

# R6: nothing shipped depends on a dev-only crate, no wildcard version
# requirement, no advisory against anything in the tree. `cargo-deny` is
# supplied by the locked SDK, so this is part of `just vv`.
#
# Advisories, bans, licences and sources, over the dependency graph.
deny:
    cargo deny --all-features check

# All product compilation is delegated to the immutable SDK.
setup:
    prismpm fetch --locked

build: product-build

product-build:
    node scripts/build.mjs

# Diagnostic source proof; this does not qualify application artifacts.
core-proof:
    node scripts/verify-core.mjs

product-mutations:
    node scripts/mutations.mjs

product-reproducibility:
    node scripts/reproduce.mjs

# Stage the exact verified SDK browser projection for GitHub Pages.
pages:
    node scripts/pages.mjs
