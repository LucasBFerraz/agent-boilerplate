# Architecture

This document explains how the pieces fit together. For a quick visual, see the [README](../README.md).

## Goals

1. **A board-driven loop.** The Kanban is the source of truth. The agent watches for cards in a "ready" state, picks them up, and moves them through the columns.
2. **A pluggable agent.** The agent is a black box with a small contract. Swap Claude Code, Copilot, Mavis, or your own tool without touching the workflow.
3. **A reusable infrastructure.** The boilerplate is a *template* you can copy or `uses:` from a ref. It doesn't ship your app code.
4. **Safe by default.** Agents open PRs, never push to main, never approve their own work.

## Components

```
┌──────────────────────────────────────────────────────────────────────┐
│                          GitHub Project v2 board                     │
│  ┌─────────┐  ┌───────┐  ┌──────────────┐  ┌───────────┐  ┌──────┐  │
│  │ Backlog │→ │ Ready │→ │ In Progress  │→ │ In Review │→ │ Done │  │
│  └────┬────┘  └───┬───┘  └──────┬───────┘  └─────┬─────┘  └──┬───┘  │
│       │           │             │                │            │      │
└───────┼───────────┼─────────────┼────────────────┼────────────┼──────┘
        │           │             │                │            │
        │           │             │ kanban-sync (moves cards)    │
        │           │             │                ▼            │
        │           │     ┌───────┴──────────────────────────────────────┐
        │           │     │           agent-on-card.yml (reusable)       │
        │           │     │  1. resolve issue                            │
        │           │     │  2. kanban-sync → "In Progress"             │
        │           │     │  3. kanban-read-card                         │
        │           │     │  4. checkout-and-prepare                     │
        │           │     │  5. agent-runner (pluggable)                 │
        │           │     │  6. kanban-sync → "In Review"                │
        │           │     └───────┬──────────────────────────────────────┘
        │           │             │
        │           │             ▼
        │           │     ┌──────────────────────────────────────┐
        │           │     │         agent-runner (CA)            │
        │           │     │  ↳ setup-agent-{claude|copilot|…}    │
        │           │     │  ↳ write .agent-prompt.md            │
        │           │     │  ↳ invoke CLI in non-interactive mode│
        │           │     │  ↳ collect agent-result.json         │
        │           │     └──────────────────────────────────────┘
        │           │             │
        │           │             ▼
        │           │     ┌──────────────────────────────────────┐
        │           │     │     branch + PR (human merges)       │
        │           │     └──────────────────────────────────────┘
        │           │
        │  (label "agent:ready" — picked up from any of Backlog/Ready/Todo)
        │           ▼
        │     issues event ──▶ workflow_call ──▶ agent-on-card.yml
        │
        └─── agent-scheduled-triage scans Backlog/Ready/Todo for cards
             without the label and posts a nudge comment.
```

### Composite actions

Each does one thing well, takes typed inputs, and emits typed outputs.

| Action | Purpose | Inputs | Outputs |
|---|---|---|---|
| `checkout-and-prepare` | Check out the repo, derive issue number, create a branch. | `base_ref`, `token`, `branch_prefix`, `issue_number`, `issue_title` | `branch`, `issue_number`, `base_ref`, `issue_title` |
| `kanban-read-card` | Resolve the issue's project card and synthesize a prompt. | `issue_number`, `project_title`, `project_owner`, `token`, `status_field_name`, `require_card` | `item_id`, `project_id`, `status_option_id`, `status_name`, `status_field_id`, `card_url`, `prompt` |
| `kanban-sync` | Move a card to a target status. Optional comment. | `issue_number`, `project_title`, `project_owner`, `target_status`, `token`, `status_field_name`, `comment`, `comment_once` | `moved`, `new_status_name`, `new_status_option_id` |
| `agent-runner` | Install + invoke the agent CLI on the current branch. | `agent`, `prompt`, `prompt_file`, `setup_action`, `agent_cli`, `extra_args`, `timeout_minutes`, `working_directory`, `agent_token`, `result_file` | `pr_url`, `summary`, `files_changed`, `result_json` |
| `setup-agent-claude` | Install Claude Code + Anthropic auth. | `token`, `version`, `api_key` | — |
| `setup-agent-copilot` | Install Copilot CLI + GitHub auth. | `token` | — |
| `setup-agent-mavis` | Install Mavis / MiniMax Code CLI. | `token`, `version`, `api_key` | — |
| `setup-agent-custom` | Passthrough for `agent: custom`. | `token` | — |

### Reusable workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `agent-on-card.yml` | `workflow_call` / `issues: labeled` | Card (with `agent:ready` label) → In Progress → agent run → In Review. The card may sit in any unready column (`Backlog`, `Ready`, or `Todo`); the label, not the status, is the trigger. |
| `agent-discussion.yml` | `workflow_call` / `issue_comment: created` | `@agent-bot` mention → continue on the existing branch. |
| `agent-scheduled-triage.yml` | `workflow_call` / `schedule` | Nudge un-ready cards in `Backlog` / `Ready` / `Todo`; surface stuck work. |

### Kanban CLI

A small TypeScript package (`packages/kanban-cli`) wrapping the GitHub Projects v2 GraphQL API. Used by the composite actions. Direct subcommands:

```
kanban get-card   --issue 123 --project "Backlog" --owner my-org [--field Status] [--require]
kanban move       --issue 123 --project "Backlog" --owner my-org --to "In Review" [--comment "..."] [--comment-only-if-moved]
kanban comment    --issue 123 --body "..."
kanban ready      --project "Backlog" --owner my-org [--status Todo] [--limit 50] [--format table|json]
kanban whoami
```

### The agent contract

`agent-runner` is the only thing that talks to the agent CLI. The contract is small:

1. Read prompt from `AGENT_PROMPT_FILE` (set by the action).
2. Operate on the current branch. Don't switch.
3. Commit + push.
4. Open / update PR.
5. Write JSON to `result_file`:

   ```json
   { "pr_url": "...", "summary": "...", "files_changed": ["..."] }
   ```

Adding a new runtime = drop a `setup-agent-<name>/action.yml` and a new `case` branch in `agent-runner/action.yml`. ~30 lines of YAML.

## State management

### The card is the source of truth

A card's `Status` option is the agent's queue. The agent does **not** keep its own todo list. The composite actions always re-read the card before acting, so a stale agent has no way to drift.

### Idempotency

`kanban-sync` is a no-op if the card is already at the target status. The reusable workflow's `concurrency:` block prevents two agent runs from racing on the same issue. PR creation is also idempotent: the agent is told to update the existing PR if one exists for the branch.

### Auth

| Actor | What they need | Where it comes from |
|---|---|---|
| `kanban-cli` (move/get-card/ready) | Projects v2 access | `secrets.AGENT_GH_TOKEN` (PAT or GitHub App) |
| `kanban-cli` (comment) | `issues: write` | Same token |
| Agent CLI | Its own API key (Anthropic, Mavis, …) | `secrets.AGENT_API_KEY` |
| Git push | `contents: write` | Same `AGENT_GH_TOKEN` |

The composite actions accept `secrets.agent_gh_token || secrets.github_token` so the boilerplate works on a `GITHUB_TOKEN` for comment/push and only requires a PAT for Projects v2 operations.

## What this isn't

- **Not a self-hosted runner.** It runs on `ubuntu-latest`. If you need GPUs or large memory, fork and customize.
- **Not a multi-repo fan-out.** Each consumer repo has its own board + workflows. A meta-board that aggregates across repos is a future feature.
- **Not a learning system.** The agent is stateless. Memory across runs is the responsibility of the agent CLI (some support `CLAUDE.md`, `mavis --resume`, etc.).
