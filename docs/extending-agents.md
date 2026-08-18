# Extending agents

How to add a new agent runtime, or how to write a custom one.

## The contract

`agent-runner` (`.github/actions/agent-runner/`) is a thin composite action. The agent CLI it invokes must:

1. Read its prompt from the file at `AGENT_PROMPT_FILE` (or stdin, depending on the runtime — see existing cases).
2. Operate on the current git branch. Do not switch.
3. Commit changes with a Conventional Commits message referencing the issue.
4. Push the branch using the token in `GH_TOKEN` / `GITHUB_TOKEN`.
5. Open (or update) a PR against the base branch.
6. Write a JSON file to `result_file`:

   ```json
   { "pr_url": "https://...", "summary": "...", "files_changed": ["..."] }
   ```

7. Upload any debug logs to the `agent-runner-<runtime>-<run-id>` artifact (the action does this automatically).

That's it. The action handles auth, prompt plumbing, timeout, and artifact upload.

## Adding a built-in runtime

A "built-in" runtime is one of `claude | copilot | mavis | custom`. To add a new one, say `aider`:

### 1. Create the setup action

`.github/actions/setup-agent-aider/action.yml`:

```yaml
name: 'Setup — Aider'
description: 'Install Aider and authenticate it via OpenAI / Anthropic env vars.'

inputs:
  token:
    description: 'GitHub token for push.'
    required: false
    default: ${{ github.token }}
  openai_api_key:
    description: 'OpenAI key (default: secrets.OPENAI_API_KEY).'
    required: false
    default: ${{ secrets.OPENAI_API_KEY }}

runs:
  using: 'composite'
  steps:
    - name: Install Aider
      shell: bash
      run: |
        set -euo pipefail
        pip install aider-chat
        aider --version

    - name: Authenticate
      if: ${{ inputs.openai_api_key != '' }}
      shell: bash
      env:
        OPENAI_API_KEY: ${{ inputs.openai_api_key }}
      run: echo "OPENAI_API_KEY present: $([[ -n "${OPENAI_API_KEY}" ]] && echo yes || echo no)"
```

### 2. Add a `case` branch in `agent-runner`

In `.github/actions/agent-runner/action.yml`, inside the `Run agent` step:

```yaml
- name: Run agent
  shell: bash
  # ...
  run: |
    # ...
    case "${AGENT}" in
      # ... existing cases ...

      aider)
        set +e
        aider --yes --message "$(cat "${PROMPT_FILE}")" \
          > "${RESULT_FILE}.log" 2>&1
        rc=$?
        set -e
        if [[ $rc -ne 0 ]]; then
          echo "::error::aider exited ${rc}. Log:" >&2
          cat "${RESULT_FILE}.log" >&2
          exit $rc
        fi
        # Aider doesn't return JSON; synthesize it.
        # You may need to extract the PR URL from the aider log.
        # Or call `gh pr create` separately.
        jq -n --arg summary "$(tail -n 30 "${RESULT_FILE}.log")" \
          '{pr_url: "", summary: $summary, files_changed: []}' \
          > "${RESULT_FILE}"
        ;;
    esac
```

### 3. Document it

- Add a row to the table in `agent-runner/README.md`.
- Add a short section in this doc with a worked example.

That's it. The consumer workflow can now pass `agent: aider`.

## Adding a runtime via the `custom` escape hatch

If you don't want to upstream a runtime into the boilerplate, you can pass `agent: custom` along with a `setup_action` path:

```yaml
- uses: ./.github/actions/agent-runner
  with:
    agent: custom
    setup_action: ./.github/actions/setup-agent-my-thing
    agent_cli: my-thing
    prompt: "..."
```

The composite action will `uses:` your setup action, then invoke the CLI. This is the recommended path for one-off integrations — keeps the boilerplate clean and lets your consumer repo own the runtime.

## Tuning the existing runtimes

### Claude Code

```yaml
- uses: ./.github/actions/agent-runner
  with:
    agent: claude
    extra_args: '--model claude-3-7-sonnet --max-tokens 8192'
    prompt: "..."
```

The `extra_args` are passed verbatim after the standard flags. Check `claude --help` for the current options.

### Mavis / MiniMax Code

```yaml
- uses: ./.github/actions/agent-runner
  with:
    agent: mavis
    extra_args: '--model mavis-3 --memory repo'
    prompt: "..."
```

### GitHub Copilot CLI

The `copilot` case uses `copilot suggest -t code`. If you want a different subcommand or richer output, copy the `case` branch into your consumer's `custom` setup and modify it.

## Output contract details

The action reads the agent's `result_file` as JSON. If the JSON is malformed, the action fails. Required fields:

| Field | Type | Notes |
|---|---|---|
| `pr_url` | string | The full PR URL. May be empty if the agent decided not to open a PR. |
| `summary` | string | One-paragraph summary for the card comment. |
| `files_changed` | string[] | List of paths. Used for the PR description. |

The action also produces a `result_json` output with the entire JSON blob, so a consumer workflow can add custom fields and use them in later steps.

## Debugging

If the agent is misbehaving:

1. Open the run on GitHub.
2. Scroll to the **Upload agent artifacts** step at the bottom.
3. Download `agent-runner-<runtime>-<run-id>`. It contains:
   - `agent-result.json` — the agent's structured output
   - `agent-result.json.log` — the agent CLI's stdout/stderr
   - `.agent-prompt.md` — the prompt the agent received
4. Inspect locally. If the agent's log is uninformative, run the same CLI locally with the same prompt to reproduce.
