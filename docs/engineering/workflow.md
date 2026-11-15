# Roomabouts Engineering Workflow

This workflow adapts the strongest ideas from [My AI Coding Workflow](https://github.com/vaibhav-space/my-ai-coding-workflow) to Roomabouts and Codex. It is intentionally project-local and paraphrased. The reference is guidance; user requirements, repository rules, approved decisions, and verified code remain authoritative.

## Lifecycle routing

| Class | Use when | Required path |
| --- | --- | --- |
| Spike | One uncertainty can be answered cheaply | Inspect or probe, record evidence, recommend next step |
| Bounded | Local non-breaking work with a small blast radius | Inspect, minimally implement, targeted tests, diff check |
| Architectural | New subsystem, shared contract, persistence, infrastructure, or cross-workstream change | Plan, independent critique, approval, implementation, independent readiness audit |

When classification is unclear, choose based on blast radius and reversibility rather than line count.

## Architectural pipeline

### 1. Implementation plan

Create `docs/plans/active/YYYY-MM-DD-topic.md` before implementation. The plan must map each requirement to:

- a concrete task and owned files;
- an observable acceptance criterion;
- an exact automated or manual verification method;
- relevant risks, failure behavior, and recovery;
- explicit non-goals and unresolved assumptions.

The plan should name the simplest robust approach and explain any new dependency or abstraction. Planning stops before product-code edits.

### 2. Independent plan review

Give the plan and relevant repository context to a fresh reviewer. The reviewer challenges factual assumptions, contract compatibility, failure handling, concurrency, privacy, performance, recovery, and test coverage. Findings must include severity, concrete impact, mitigation, and verification.

The reviewer should distinguish credible risks from hypothetical complexity. The coordinator updates the plan to resolve major findings. The user approves consequential decisions and any accepted major residual risk before implementation begins.

### 3. Implementation and verification

The producer implements only the approved scope. Deterministic logic follows a red-green-refactor loop when test tooling exists. Live-sensor and animation work uses recorded replays and explicit hardware or visual acceptance checks in addition to automated tests.

Targeted verification runs throughout development. A workstream is not ready for integration until its acceptance criteria have evidence.

### 4. Independent production-readiness audit

A fresh reviewer starts from repository state rather than the producer's summary:

- inspect status, all diffs, and all untracked files;
- compare implementation against the approved plan and shared contracts;
- inspect callers and integration boundaries, not only changed lines;
- run relevant tests and real runtime/replay checks;
- identify secrets, privacy regressions, unsafe retries, accidental retention, and unrelated churn.

Confirmed issues receive the smallest targeted fix and fresh verification. Architectural remediation returns to planning and approval.

## Multi-chat operating model

Use one coordinating chat and at most a few isolated implementation chats at a time:

| Workstream | Owns | Must not own |
| --- | --- | --- |
| Coordinator/architecture | Requirements, observation and track contracts, decisions, plan index, integration | Concurrent feature implementation in another chat's files |
| Sensor/replay | Home Assistant input, sensor adapters, recorder, replay fixtures | Tracking policy or UI presentation |
| Tracking core | Transforms, association, smoothing, stale/fade state, confidence | Vendor-specific entities or rendering |
| Map UI | Floor-plan rendering, trails, anonymous characters, interaction | Sensor ingestion or identity truth |
| Setup/calibration | Configuration validation, map editor, sensor pose and room calibration | Core tracking algorithms |

Within the available concurrency, prefer one coordinator plus a small number of non-overlapping workstreams. Start downstream work only after shared contracts are stable enough to consume.

Each implementation chat records its branch/worktree, owned files, dependencies, verification command, and handoff state. Architectural work also links its active plan; bounded work records scope and acceptance criteria in the chat or task. Two chats never commit in the same worktree. Review may cross branches; implementation ownership does not.

## Integration gates

The coordinator integrates a workstream only when:

- acceptance criteria are demonstrably met;
- producer verification is fresh and recorded;
- independent review has no unresolved critical or major finding;
- shared contracts and decision records match the diff;
- the branch contains no unrelated edits, secrets, or untracked artifacts.

Merging, pushing, branch deletion, and worktree cleanup happen only when explicitly requested.

## Evidence standard

Completion evidence includes commands, exit status, and meaningful output—not simply “tests pass.” Hardware or visual checks name the setup, scenario, expected result, and observed result. Anything not exercised is listed as an unverified assumption or residual risk.
