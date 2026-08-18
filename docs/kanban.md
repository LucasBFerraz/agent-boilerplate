# Kanban

This document describes the data model: how issues, projects, and cards relate, and how the boilerplate talks to them.

## The model

```
┌──────────────────────────┐         ┌──────────────────────────────────────────┐
│       GitHub Repo        │         │           Project v2 board               │
│                          │         │                                          │
│  ┌────────────────────┐  │   add   │  ┌────────┬───────┬─────────┬───────┐  │
│  │       Issue        │──┼─────to──┼─▶│Backlog │ Ready │In Prog. │  ...  │  │
│  │                    │  │  card   │  └───┬────┴───┬───┴────┬────┴───┬───┘  │
│  │  - number          │  │         │      │        │        │        │ has  │
│  │  - title, body     │  │         │  ┌───┴────────┴────────┴────────┴──┐   │
│  │  - labels          │  │         │  │ ProjectItem                   │   │
│  │  - state           │  │         │  │  - id                         │   │
│  └────────────────────┘  │         │  │  - fieldValues                │   │
│                          │         │  │    - Status: optionId         │   │
└──────────────────────────┘         │  └──────────────────────────────┘   │
                                     └──────────────────────────────────────────┘
```

- An **issue** lives in a repo.
- A **Project v2** lives at the org or user level.
- A **ProjectItem** (a "card") is the connection between an issue and a project. It carries the project's field values for that issue (Status, Assignees, Iteration, etc.).

## Why a custom CLI?

The official `gh` CLI doesn't (yet) expose Projects v2 mutations. We use the GraphQL API directly. The CLI is small (~600 lines of TS) and lives at `packages/kanban-cli/`.

## The four commands

### `get-card`

Given an issue number, returns the project card's metadata + a synthesized prompt.

```
kanban get-card --issue 123 --project "Backlog" --owner my-org [--field Status] [--require]
```

Output (key=value, default):

```
item_id=<project item node id>
project_id=<project node id>
status_option_id=<current status option id>
status_name=<current status option name>
status_field_id=<status field id on the project>
card_url=<issue URL>
prompt=<synthesized prompt: title + body + labels + acceptance criteria + AGENTS.md pointer>
```

### `move`

Move a card to a target status. Idempotent.

```
kanban move \
  --issue 123 --project "Backlog" --owner my-org \
  --to "In Review" \
  [--field Status] \
  [--comment "🤖 Agent run finished"] \
  [--comment-only-if-moved]
```

Output:
```
moved=true|false
new_status_name=In Review
new_status_option_id=<id>
commented=true|false
```

### `comment`

Post a comment on an issue (REST, not Projects). Useful as a stand-alone.

```
kanban comment --issue 123 --body "..."
```

### `ready`

List issues in a target status.

```
kanban ready \
  --project "Backlog" --owner my-org \
  [--status Todo] [--limit 50] \
  [--format json|table]
```

Output (JSON):
```json
[
  { "issue_number": 123, "title": "...", "url": "...", "state": "OPEN", "labels": ["bug"], "item_id": "..." },
  ...
]
```

## Status options

The boilerplate does **not** create the Status field or its options — that's a one-time project setup decision. It ships with the **5-state model** as the default, matching GitHub's default Project v2 board:

| Column | Default value | Meaning | Moved by |
|---|---|---|---|
| `Backlog` | `Backlog` | Issues that exist but aren't triaged yet. | — |
| `Ready` | `Ready` | Triaged, description clear, waiting to be picked up. | — |
| `In Progress` | `In Progress` | The agent is actively working on it. | Agent on pickup. |
| `In Review` | `In Review` | A PR is open and waiting for a human. | Agent after PR creation. |
| `Done` | `Done` | PR merged or otherwise resolved. | Human (not automated). |

The corresponding workflow inputs (all overridable on the consumer's `uses:` invocation):

| Workflow input | Default value | Used in |
|---|---|---|
| `backlog_status` | `Backlog` | `agent-scheduled-triage` (nudge scope) |
| `ready_status` | `Ready` | `agent-scheduled-triage` (nudge scope) |
| `todo_status` | `Todo` | `agent-scheduled-triage` (nudge scope, legacy 4-state) |
| `in_progress_status` | `In Progress` | `agent-on-card` + `agent-scheduled-triage` (move target) |
| `in_review_status` | `In Review` | `agent-on-card` (move target) |
| `done_status` | `Done` | `agent-scheduled-triage` (move target, when present) |

### Trigger model: label, not status

The agent is triggered by the **`agent:ready` issue label**, regardless of which `Backlog`/`Ready`/`Todo` column the card currently sits in. A human adds the label when the card is ready to hand off; the agent then moves the card to `In Progress` and proceeds.

This means:

- **You can move a card from `Backlog` → `Ready` without triggering anything.** Triage is decoupled from agent pickup.
- **You can also leave the card in `Todo` (4-state model) and still hand it off with the label.** The status is metadata; the label is the trigger.
- **The triage workflow nudges cards in any of `Backlog`, `Ready`, or `Todo`** that have been sitting there without the label.

### Migrating from a 4-state board

If your project already uses the older 4-state model (`Todo` / `In Progress` / `In Review` / `Done`):

1. **Nothing breaks.** The defaults are: `Backlog`/`Ready` (added, not used unless present on your board) + `Todo` (still scanned).
2. **To adopt the 5-state model**, add the `Backlog` and `Ready` options to your project's Status field, then move cards from `Todo` into one of them. You can also drop `Todo` from the triage scan by overriding `todo_status: ''` on the consumer workflow.
3. **To use a non-default option name** (e.g. `Backlog/Ready/Todo` in pt-BR, or `Awaiting Triage/Ready/WIP/Review/Closed`), override any of the inputs above on the consumer workflow.

## Multi-project setups

If you have multiple boards (e.g. one per team), each consumer workflow invocation can target a different `project_title` + `project_owner`. The card → issue lookup will pick the right one.

If a single issue lives on multiple projects, the CLI picks the project whose `title` matches `--project`. There's currently no way to disambiguate by project number from the CLI; file an issue if you need that.

## Why this is brittle and what to do about it

| Brittle thing | Mitigation |
|---|---|
| Projects v2 schema occasionally renames types. | Pin the CLI to a known-good API version (`X-GitHub-Api-Version: 2022-11-28`). Bump deliberately. |
| `GITHUB_TOKEN` doesn't have Projects access. | Use a PAT or GitHub App, surface the hint in CLI errors. |
| Field names are case-sensitive in the API but the CLI matches case-insensitively. | Don't. Be consistent. |
| `ready` fetches `limit * 2` items to allow filtering. | Fine for small boards; rewrite if you have 10k+ cards. |
