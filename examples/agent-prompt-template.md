# Agent prompt template

The `kanban-read-card` action synthesizes a prompt for the agent by combining the issue title, body, labels, and project status. You can customize the format by overriding the `prompt` input in your reusable workflow.

The default template (see `packages/kanban-cli/src/commands/get-card.ts`) is:

```markdown
# Issue #<n> — <title>

**Kanban status:** <current Status option, e.g. "Todo">
**Project:** <project title>
**Labels:** <comma-separated labels>

<issue body — markdown, exactly as the user wrote it>

## Acceptance criteria
Look for a checklist (`- [ ]` / `- [x]`) in the body above. If present,
those are your acceptance criteria. If not present, infer a sensible
Definition of Done from the title and description and list it in your
PR description.

## Operating contract
You are running in a GitHub Actions sandbox. See `AGENTS.md` at the
repo root for the full rules.
```

## Customizing the template

Two common customizations:

### 1. Add repo-specific instructions

In your consumer workflow, after `kanban-read-card`, you can build a custom prompt:

```yaml
- uses: YOUR-ORG/ai-agent-boilerplate/.github/actions/kanban-read-card@v0.1
  id: card
  with:
    issue_number: ${{ needs.resolve.outputs.issue_number }}
    project_title: ${{ inputs.project_title }}
    token: ${{ secrets.agent_gh_token }}

- name: Build custom prompt
  id: build
  shell: bash
  run: |
    cat > .agent-prompt.md <<EOF
    ${{ steps.card.outputs.prompt }}

    ## Repo-specific notes
    - Always run \`pnpm test\` before pushing.
    - Update CHANGELOG.md.
    - Mention @octocat in the PR description if you touched `src/auth/`.
    EOF

- uses: YOUR-ORG/ai-agent-boilerplate/.github/actions/agent-runner@v0.1
  with:
    agent: mavis
    prompt_file: .agent-prompt.md
```

### 2. Pull the latest "Definition of Done" from a repo file

```bash
echo "## Definition of Done (from docs/DOD.md)" >> .agent-prompt.md
cat ../docs/DOD.md >> .agent-prompt.md
```

This keeps the human-written DoD authoritative while still letting the
agent inherit the synthesized context.
