# Architecture Decision Records

Use a decision record when a choice is expensive to reverse, changes a shared contract, adds a runtime dependency or service, or changes privacy, retention, identity, or distribution behavior.

Name records `NNNN-short-title.md`. Never rewrite an accepted decision to hide history; supersede it with a new record.

## Current decisions

- `0001-rmm-fork-compatibility.md` — **Accepted.** Use the RMM fork while preserving its internal Home Assistant compatibility boundary.
- `0002-initial-security-and-privacy-floor.md` — **Accepted.** Support Home Assistant entity input only, remove inherited exclusive transports from the first proof, and keep movement coordinates ephemeral.
- `0003-browser-test-toolchain.md` — **Accepted.** Pin a minimal npm, Playwright, Chromium, and FFmpeg lane for Phase 3 browser and screenshot verification.

Planned decisions 0004–0005 are created only at their gated phases: real-capture retention and post-tuning one-sensor thresholds.

## Decision template

```markdown
# NNNN: <Decision>

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD
Owners:
Related plan:

## Context

Verified constraints and the decision that is required.

## Options considered

## Decision

## Consequences

Positive effects, costs, failure modes, migration or rollback, and what remains deliberately unsupported.

## Verification

How the decision will be validated in code, replay tests, hardware checks, or production telemetry.
```
