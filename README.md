# AI Agent Boilerplate

A **language-agnostic** boilerplate for running AI coding agents inside GitHub Actions, with a tight loop into **GitHub Projects v2** as a Kanban board.

> The agent reads a card, edits code, opens a PR, and moves the card to *In Review*. A human merges. That's the default loop.

## What's in the box

- **Modular GitHub Actions**
  - **Reusable workflows** (`workflow_call`) under `.github/workflows/` for the three main entry points: card-trigger, `@`-mention discussion, and scheduled triage.
  - **Composite actions** under `.github/actions/` that compose cleanly: `checkout-and-prepare`, `kanban-read-card`, `agent-runner`, `kanban-sync`, plus per-runtime setup actions.
- **Pluggable agent runtime** — `agent-runner` is a thin contract. Ship your own CLI (Claude Code, GitHub Copilot, Mavis / MiniMax Code, Aider, …) by dropping in a `setup-agent-<name>` action.
- **Kanban CLI** (`packages/kanban-cli`) — small TypeScript package wrapping the GitHub Projects v2 GraphQL API: `move`, `comment`, `ready`, `get-card`.
- **Agent contract** — `AGENTS.md` at the repo root tells any agent exactly what it may and may not do.
- **Docs & examples** — see `docs/` and `examples/`.

## Architecture in one diagram

```
                ┌─────────────────────────────────────┐
                │       GitHub Projects v2 board      │
                │   Todo  →  In Progress  →  Review   │
                └─────────────────────────────────────┘
                       ▲                │
        kanban-sync    │                │  read card context
        (move card)    │                ▼
                       │       ┌──────────────────────┐
                       │       │  agent-on-card.yml   │  (reusable)
                       │       └──────────────────────┘
                       │                │
                       │                ▼
                       │       ┌──────────────────────┐
                       │       │  agent-runner (CA)   │
                       │       │  ↳ setup-agent-…     │
                       │       │  ↳ invoke CLI        │
                       │       └──────────────────────┘
                       │                │
                       │                ▼
                       │       ┌──────────────────────┐
                       │       │   branch + PR        │
                       │       └──────────────────────┘
                       │                │
                       └────────────────┘
                              (PR merged → "Done")
```

## Quick start

1. **Create a Project v2** in your org/user. Add four Status options: `Todo`, `In Progress`, `In Review`, `Done`.
2. **Add a custom label** `agent:ready` to your repo.
3. **Create a GitHub PAT or App** with `repo`, `project`, `read:org` (store as `AGENT_GH_TOKEN` secret).
4. **In a consumer repo**, copy the example workflow from `examples/consumer-repo-workflow.yml` into `.github/workflows/agent.yml` and `uses:` one of the reusable workflows from this repo.
5. **Open an issue**, put it on the project in the `Todo` column, add the `agent:ready` label. The agent picks it up.

Full setup: see [`docs/setup.md`](docs/setup.md).

## Repository layout

```
.
├── AGENTS.md                       # Agent contract (do / don't)
├── README.md
├── LICENSE
├── .github/
│   ├── workflows/                  # Reusable workflows (workflow_call)
│   └── actions/                    # Composite actions
│       ├── checkout-and-prepare/
│       ├── kanban-read-card/
│       ├── kanban-sync/
│       ├── agent-runner/           # Pluggable agent contract
│       └── setup-agent-{claude,copilot,mavis,custom}/
├── packages/
│   └── kanban-cli/                 # TypeScript CLI for Projects v2
├── examples/
│   ├── consumer-repo-workflow.yml
│   └── agent-prompt-template.md
└── docs/
    ├── architecture.md
    ├── setup.md
    ├── kanban.md
    ├── triggers.md
    ├── extending-agents.md
    └── security.md
```

## License

MIT — see [`LICENSE`](LICENSE).
