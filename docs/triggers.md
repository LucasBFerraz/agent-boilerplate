# Triggers

How the agent gets activated. There are three first-class triggers, all of them `workflow_call` so a consumer can pick and choose.

## 1. Card-driven (default)

**Workflow:** `agent-on-card.yml`
**Event:** `issues: labeled` with the label `agent:ready` (configurable).

```
issue opened → added to project board
       │       (Backlog / Ready / Todo column)
       │       labeled "agent:ready"
       ▼
   issues:labeled event
       │
       ▼
   agent-on-card.yml (workflow_call / direct trigger)
       │
       ├──> kanban-sync: move card → "In Progress"
       ├──> kanban-read-card: get context + prompt
       ├──> checkout-and-prepare: branch from main
       ├──> agent-runner: install + run agent
       └──> kanban-sync: move card → "In Review"
```

**Override inputs:** `agent_trigger_label`, `in_progress_status`, `in_review_status`, `base_ref`, `timeout_minutes`, `agent_extra_args`.

### Why a label, not the card's status column?

The card's `Status` field can sit in any of `Backlog`, `Ready`, or `Todo` (5-state + 4-state legacy) — the column describes where the card is in the human workflow, not whether the agent should pick it up. Decoupling the trigger from the column gives you two free properties:

1. **Triage is independent of agent pickup.** A human can move a card from `Backlog` to `Ready` without triggering the agent — the label is the explicit hand-off.
2. **4-state and 5-state boards share the same trigger mechanism.** The agent doesn't care which column the card is in; the label is uniform across both models.

Labels let humans **opt in** a card to the agent. A human triage step (add the label) is the simplest guardrail. The agent never runs on un-labeled issues.

## 2. @-mention (collaborative)

**Workflow:** `agent-discussion.yml`
**Event:** `issue_comment: created` containing the mention string (default `@agent-bot`).

```
human: "@agent-bot please also update the changelog"
       │
       ▼
   issue_comment:created event
       │
       ├──> resolve job: verify mention, not from bot
       │
       └──> run job: check out existing agent branch
                   (or create one)
                   agent-runner with the comment as additional context
                   reply on the same thread
```

**Override inputs:** `bot_mention`, `base_ref`, `timeout_minutes`.

### Why a separate workflow?

The on-card workflow is "card → PR". The on-mention workflow is "PR → next commit on the same PR". Mixing them makes concurrency hard — you'd have to reason about which one owns a given branch. Separating them keeps the state machine clean.

## 3. Scheduled triage (proactive)

**Workflow:** `agent-scheduled-triage.yml`
**Event:** `schedule` (default: weekdays 06:00 UTC).

```
cron fires
   │
   ├──> list cards in "Backlog" / "Ready" / "Todo" columns
   │    (the three "unready" columns; defaults match the
   │     5-state model and include the 4-state legacy)
   │
   └──> for each card without "agent:ready" label:
            post a nudge comment on the issue,
            naming the card's current column
```

**Override inputs:** `cron_schedule`, `max_cards_per_run`, `backlog_status`, `ready_status`, `todo_status`. Set any of the three status inputs to an empty string to drop that column from the scan.

### Why a separate workflow?

Triage is read-mostly. Mixing it with the heavy agent run would waste runner minutes on cron no-ops. It also has different permissions (`contents: read` instead of `write`).

## Adding a new trigger

Say you want the agent to run on a `pull_request: opened` event (e.g. to auto-format a contributor's PR). Steps:

1. **Create a new reusable workflow** at `.github/workflows/agent-pr-format.yml`:

   ```yaml
   on:
     workflow_call:
       inputs: { /* same as agent-on-card */ }
     pull_request:
       types: [opened]

   jobs:
     run:
       uses: ./.github/workflows/_shared-agent-runner.yml   # Extract a shared job if you want
       with: { /* ... */ }
   ```

2. **Or use the composite actions directly** in a non-reusable workflow:

   ```yaml
   on: pull_request
   jobs:
     format:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: ./.github/actions/checkout-and-prepare
           with:
             branch_prefix: 'agent-format'
         - uses: ./.github/actions/agent-runner
           with:
             agent: mavis
             prompt: 'Format the code in this PR and commit.'
   ```

3. **Document it** in this file under a new section.

## Anti-patterns

- **Don't add a "push to main" trigger.** The agent never owns main.
- **Don't fan out from one card to many.** If a card spawns 5 issues, create 5 cards — don't try to multiplex.
- **Don't trigger on `schedule` to "fix all bugs".** That's a recipe for runaway costs. The triage workflow only nudges; humans still opt in via the label.
