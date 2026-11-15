# Roomabouts Agent Guide

This file is the shared engineering contract for every human and AI contributor to Roomabouts.

## Product invariants

- Roomabouts is a local-first ambient home map, not a security, life-safety, or guaranteed child-location system.
- Anonymous positioning must work without identity. Observations, tracks, and identities are separate concepts.
- A sensor target slot is diagnostic input, never a durable person identifier.
- Uncertainty must remain visible through states such as coasting, fading, or last seen. Never fabricate precision or identity confidence.
- Raw high-rate coordinates are ephemeral by default. Any retention, cloud transmission, or identity inference requires an explicit product decision.
- Sensor integrations terminate at a normalized observation contract. Core tracking and UI code must not depend on vendor-specific entities.
- Recorded deterministic replays are the primary development and regression-test input; ordinary CI must not require live household hardware.
- All shipped names, visuals, typography, sounds, and copy must be original and must not imitate Harry Potter or Wizarding World properties.

## Work classification

Classify a task before editing:

1. **Spike** — a small feasibility check. Inspect or run one focused probe, change no product architecture, and report the finding.
2. **Bounded** — a localized, non-breaking change. Inspect the relevant path, make the smallest coherent edit, and run targeted verification.
3. **Architectural** — a new subsystem, cross-cutting feature, persistent-data change, public-contract change, or multi-service integration. Create an implementation plan, have a fresh reviewer challenge it, obtain approval for consequential decisions, then implement and run an independent diff audit.

Do not force the architectural pipeline onto documentation fixes or other genuinely small work.

## Before changing files

- Read the nearest `AGENTS.md`, the active plan, relevant decisions, and the surrounding code.
- Inspect `git status` and preserve all unrelated or pre-existing work.
- Verify file paths, APIs, versions, configuration, and runtime behavior from the repository or primary documentation. Never invent them.
- State the task scope, non-goals, owned files, acceptance criteria, and verification method before non-trivial implementation.
- If another chat owns a file or contract, coordinate through the lead chat rather than editing across its boundary.

## Engineering rules

- Prefer, in order: no new code, existing project utilities, standard library, native platform capabilities, installed dependencies, then the smallest justified new code or dependency.
- Solve the root cause at the correct boundary. Do not wrap symptoms, add speculative frameworks, or generalize before a demonstrated second use.
- Keep diffs surgical. Avoid unrelated refactors, formatting churn, generated-file noise, and drive-by cleanup.
- For deterministic behavior, reproduce or write the failing test first when a test harness exists. Use executable reproduction scripts when it does not.
- Track association, transforms, stale timeouts, confidence, and state transitions require deterministic tests. Sensor adapters require contract tests. Visual and hardware behavior may use replay fixtures plus explicit manual acceptance checks.
- Retries for state-changing operations must define duplicate prevention and replay behavior. Do not add retry infrastructure where no retryable write exists.
- On a failed verification run, stop cascading edits, inspect the evidence, form one new hypothesis, apply one minimal correction, and verify again.

## Approval gates

A user-approved plan or explicit user direction is required before:

- adding a subsystem, runtime dependency, sensor family, cloud service, or production infrastructure;
- changing public APIs, persisted schemas, data-retention behavior, privacy boundaries, identity inference, or network transmission;
- changing security or authorization behavior, release/distribution configuration, or destructive or difficult-to-reverse data operations;
- merging, pushing, deleting branches/worktrees, rewriting history, or discarding user changes.

Read-only inspection, tests using installed tooling, and bounded non-breaking fixes may proceed autonomously.

## Parallel Codex work

- One implementation chat owns one branch/worktree. Architectural work also owns one active plan; bounded work records its scope and acceptance criteria in the chat or task.
- The coordinating chat owns requirements, shared contracts, plan status, integration order, and final acceptance.
- Declare file ownership before parallel implementation. Do not assign overlapping files to concurrent chats.
- Freeze shared contracts before downstream work starts. Contract changes return to the coordinating chat.
- Use a fresh chat or subagent for architectural plan criticism and another fresh context for production-readiness review.
- Reviewers report findings; they do not silently redesign another workstream or edit its branch unless assigned remediation.

## Verification and handoff

Before claiming completion:

1. Inspect `git status`, unstaged and staged diffs, and every untracked file.
2. Run the relevant tests plus available lint, type-check, and build commands. Record commands, exit status, and material output.
3. Verify each acceptance criterion, including critical failure paths. Never weaken or delete tests merely to obtain a pass.
4. Check for secret leakage, accidental data retention, dependency changes, contract drift, and unrelated edits.
5. Report the outcome, files changed, verification evidence, known gaps, residual risks, and the next integration action.

Do not claim behavior that was not exercised. Clearly separate verified results from manual checks and untested assumptions.
