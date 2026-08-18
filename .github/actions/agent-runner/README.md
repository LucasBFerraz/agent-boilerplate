# `agent-runner` — pluggable AI agent contract

A composite action that installs an agent CLI and invokes it in non-interactive mode against the current branch. The agent is expected to commit + push, then write a JSON result file.

## Inputs

| Name | Required | Default | Description |
|---|---|---|---|
| `agent` | yes | `mavis` | One of `claude`, `copilot`, `mavis`, `custom`. |
| `prompt` | one of | — | The prompt to send to the agent. |
| `prompt_file` | one of | — | Path to a file containing the prompt. |
| `setup_action` | only for `custom` | — | Path to a custom setup action. |
| `agent_cli` | no | derived | Override the CLI binary name. |
| `extra_args` | no | — | Extra args passed to the CLI. |
| `timeout_minutes` | no | `20` | Hard timeout. |
| `working_directory` | no | `${{ github.workspace }}` | Where to run from. |
| `agent_token` | no | `${{ github.token }}` | Token the agent uses for git push. |
| `result_file` | no | `agent-result.json` | Where the agent writes its JSON. |

## Outputs

| Name | Description |
|---|---|
| `pr_url` | PR URL the agent opened. |
| `summary` | Short summary the agent returned. |
| `files_changed` | Comma-separated list of changed files. |
| `result_json` | The full JSON result. |

## The agent contract

The CLI must:

1. Read the prompt from the file passed in `AGENT_PROMPT_FILE` (or stdin, depending on the runtime).
2. Operate on the current git branch. Do not switch branches.
3. Commit changes with a Conventional Commits message referencing the issue number.
4. Push the branch using the token in `GH_TOKEN` / `GITHUB_TOKEN`.
5. Open (or update) a PR against the base branch.
6. Write a JSON file to `result_file` of the form:

```json
{
  "pr_url": "https://github.com/owner/repo/pull/123",
  "summary": "Implemented X by changing Y.",
  "files_changed": ["src/x.ts", "src/x.test.ts"]
}
```

If the agent cannot complete the task, it must still write the file with empty `pr_url` and a summary that explains why.

## Supported runtimes

- **`claude`** — Anthropic's Claude Code CLI (`claude --print --dangerously-skip-permissions`).
- **`copilot`** — GitHub Copilot CLI (`copilot suggest`).
- **`mavis`** — Mavis / MiniMax Code CLI (`mavis run --non-interactive`).
- **`custom`** — any other CLI. You provide `setup_action` to install it, and `agent_cli` to name the binary.

## Adding a new runtime

1. Create `.github/actions/setup-agent-<name>/action.yml` that installs and authenticates your CLI.
2. Add a `case` branch in `action.yml` under the `Run agent` step.
3. Document the contract in this README.

That's it — `agent-runner` is a thin wrapper.
