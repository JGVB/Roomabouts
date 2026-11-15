# Implementation Plans

Architectural work uses a durable plan so multiple chats can coordinate from the same facts.

Store current plans in `active/`, completed plans in `completed/`, and plans invalidated by a changed foundation in `superseded/`. Preserve the reason a plan was superseded rather than silently rewriting its assumptions. Use `YYYY-MM-DD-topic.md` filenames.

## Current plan

- `active/2026-11-15-rmm-fork-foundation.md` — fork-first security, verification, presentation, and personal Home Assistant proof.

## Superseded plans

- `superseded/2026-11-14-greenfield-one-room-proof.md` — superseded when Roomabouts adopted Radar Map Manager instead of creating a greenfield TypeScript application.

## Plan template

```markdown
# <Outcome>

Status: Draft | In review | Approved | Implementing | Auditing | Complete
Owner/chat:
Branch/worktree:
Reviewer:
Related decision records:

## Problem and outcome

## Scope

### In scope

### Non-goals

## Verified current state

## Requirements and acceptance criteria

| Requirement | Implementation task | Acceptance criterion | Verification |
| --- | --- | --- | --- |

## Contracts and owned files

## Implementation sequence

- [ ] Task

## Failure handling and recovery

## Risks, assumptions, and limitations

## Independent plan review

Verdict and resolved findings.

## Handoff and verification evidence

Commands, exit status, material output, manual checks, residual risks, and next integration action.
```

Plans should be concrete enough for another chat to implement without inventing behavior, but should not become speculative design documents.
