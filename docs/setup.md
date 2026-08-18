# Setup

This walks you through the minimum to get a card → PR loop working. The whole thing takes ~15 minutes if you already have a project board.

## 0. Prerequisites

- A GitHub repo where the agent will work (we call this the **consumer repo**).
- Permission to install GitHub Apps and add secrets to that repo.
- A `node` 20+ runtime for local CLI testing (optional — CI does the work).

## 1. Create the Project v2 board

In the GitHub UI:

1. Go to your org (or user) → **Projects** → **New project** → **Board**.
2. Title: e.g. `Engineering Backlog`.
3. The default `Status` field should have options like `Backlog`, `Ready`, `In Progress`, `In Review`, `Done` — the **5-state model** that matches GitHub's default board. You can rename any of them, but if you do, override the corresponding input on the consumer workflow (`backlog_status`, `ready_status`, `in_progress_status`, `in_review_status`, `done_status`).
4. If you have an existing 4-state board (`Todo` / `In Progress` / `In Review` / `Done`), it still works out of the box — the boilerplate also scans the legacy `Todo` column. To migrate, add `Backlog` and `Ready` options to your board, move cards from `Todo` into them, and (optionally) override `todo_status: ''` on the consumer workflow to stop scanning the old column.

> The boilerplate assumes the Status field is a **single-select** field. If you use a project-level workflow (the older "Status" built-in), you may need to migrate — see [GitHub's migration guide](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-single-select-fields).

## 2. Create a personal access token (PAT)

> **Important:** `GITHUB_TOKEN` does **not** have Projects v2 access. You need a PAT or a GitHub App.

Two options:

### Option A: Classic PAT (simplest)

1. https://github.com/settings/tokens → **Generate new token** → **Classic**.
2. Scopes: `repo`, `project`, `read:org`.
3. Copy the token. You'll add it as a secret in the next step.

### Option B: Fine-grained PAT (more scoped)

1. https://github.com/settings/tokens?type=beta → **Generate new token**.
2. Repository access: select the consumer repo.
3. Permissions:
   - Issues: Read + Write
   - Pull requests: Read + Write
   - Contents: Read + Write
   - Projects: Read + Write
4. Copy and save as a secret.

### Option C: GitHub App (best for production)

See [GitHub's docs on creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app). You'll need a way to mint an installation token inside the workflow. The composite actions accept any token type that satisfies the `secrets.agent_gh_token` input.

## 3. Add the secrets

In the consumer repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret | Required? | Used for |
|---|---|---|
| `AGENT_GH_TOKEN` | Yes | Projects v2 access + push + comments. |
| `MAVIS_API_KEY` | If using Mavis | Authenticates the Mavis CLI. |
| `ANTHROPIC_API_KEY` | If using Claude Code | Authenticates the Claude CLI. |
| `COPILOT_TOKEN` | If using Copilot CLI | Authenticates the Copilot CLI. |

## 4. Add the consumer workflow

Copy `examples/consumer-repo-workflow.yml` from this repo to:

```
your-consumer-repo/.github/workflows/agent.yml
```

Edit the `uses:` line to point at your fork / version:

```yaml
uses: YOUR-ORG/ai-agent-boilerplate/.github/workflows/agent-on-card.yml@v0.1
```

Commit + push. The workflow file is now live in the consumer repo.

## 5. Add the trigger label

In the consumer repo → **Issues** → **Labels** → **New label**:

- Name: `agent:ready`
- Color: anything
- Description: "Triggers the AI agent to pick this up."

## 6. Test the loop

1. Create an issue in the consumer repo. Title: `Add a "Hello" log line to startup`. Body: a short description and a one-line acceptance criterion.
2. Add the issue to your Project v2 board. Put it in the `Backlog` or `Ready` column (or `Todo` if you're still on the 4-state model).
3. Add the `agent:ready` label.
4. Within a few seconds, the `agent-on-card.yml` workflow should run. Watch it under the **Actions** tab.
5. When it finishes, you should have:
   - A new branch `agent/issue-<n>-add-a-hello-log-line-to-startup`
   - A new PR against `main`
   - A comment on the issue with a summary
   - The card moved to `In Review`

If any of these don't happen, check:

- **The workflow ran but errored** → click into the run, expand the failed step. The most common cause is missing Projects v2 permissions on the token.
- **The workflow didn't run at all** → make sure the label name matches exactly, and that the issue is on the project board.
- **The agent produced an empty PR** → check the `agent-runner-<runtime>-<run-id>` artifact for the agent log.

## 7. (Optional) Enable the discussion bot

1. Create a GitHub user named `agent-bot` (or whatever you want to be mentioned).
2. Add them to the consumer repo as a collaborator.
3. Set `if: ${{ true }}` on the `on-mention` job in your consumer workflow.
4. Anyone can now reply on an issue / PR with `@agent-bot please also update the changelog` and the agent will continue on the same branch.

## 8. (Optional) Enable scheduled triage

The `agent-scheduled-triage.yml` workflow is already wired in the example, but it does nothing destructive by default — it just nudges un-ready cards with a comment. If you want it to also auto-create issues or move cards, edit the workflow's `triage` job.

## What to read next

- [`docs/kanban.md`](kanban.md) — the data model.
- [`docs/triggers.md`](triggers.md) — what triggers the agent and how to add new ones.
- [`docs/extending-agents.md`](extending-agents.md) — adding a new agent runtime.
- [`docs/security.md`](security.md) — threat model and mitigations.
