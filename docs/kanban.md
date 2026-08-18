# Kanban

This document describes the data model: how issues, projects, and cards relate, and how the boilerplate talks to them.

## The model

```
┌──────────────────────────┐         ┌─────────────────────────────────┐
│       GitHub Repo        │         │         Project v2 board        │
│                          │         │                                 │
│  ┌────────────────────┐  │   add   │  ┌─────────┬─────────┬───────┐  │
│  │       Issue        │──┼─────to──┼─▶│  Todo   │   ...   │ Done  │  │
│  │                    │  │  card   │  └─────────┴─────────┴───────┘  │
│  │  - number          │  │         │           ▲                     │
│  │  - title, body     │  │         │           │ has                 │
│  │  - labels          │  │         │  ┌────────┴────────┐            │
│  │  - state           │  │         │  │ ProjectItem     │            │
│  └────────────────────┘  │         │  │  - id           │            │
│                          │         │  │  - fieldValues   │            │
└──────────────────────────┘         │  │    - Status:     │            │
                                     │  │      optionId   │            │
                                     │  └─────────────────┘            │
                                     └─────────────────────────────────┘
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

The boilerplate does **not** create the Status field or its options — that's a one-time project setup decision. The defaults are:

| Workflow input | Default value | Meaning |
|---|---|---|
| `in_progress_status` | `In Progress` | Set when the agent picks up the card. |
| `in_review_status` | `In Review` | Set when the agent opens a PR. |
| `done_status` | `Done` | Set by a human after the PR is merged (not automated). |

If your project uses different option names, override them in the consumer workflow.

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
