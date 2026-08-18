# Security

The agent runs with real credentials in a real environment. This document spells out the threat model, the defaults, and the things you should change before going to production.

## Threat model

**Adversary:** a malicious issue author. They can craft a prompt that, when handed to the agent, tries to:

1. Push code to `main` (bypass branch protection).
2. Modify CI workflows to weaken checks.
3. Exfiltrate secrets to an external host.
4. Open a PR that, when merged, deploys backdoored code.
5. Self-approve and merge a PR.
6. Run destructive commands (`rm -rf`, force-push, etc.).
7. Persist a backdoor in the repo (`.github/workflows/`, `AGENTS.md`, etc.).
8. Exfiltrate the repo's contents to an attacker-controlled host.

**Out of scope (for now):**

- Compromise of the model provider (Anthropic, Mavis, etc.).
- Compromise of GitHub itself.
- Adversaries who can already write to the repo (e.g. a malicious maintainer).

## Default mitigations

| Risk | Mitigation |
|---|---|
| Push to main | `checkout-and-prepare` always creates a fresh branch from `base_ref`. The agent's `AGENTS.md` says "never push to protected branches." Branch protection should be enabled at the repo level to enforce it. |
| Modify workflows | `AGENTS.md` says "never modify workflow files." The `permissions:` block on each workflow is minimal (no `actions: write`, no `id-token: write` unless explicitly needed). |
| Disable CI | `AGENTS.md` says "never disable, weaken, or skip CI checks." The reusable workflows don't pass `--no-verify` or similar. |
| Self-approve | `pull-requests: write` does **not** include `pull-requests: approve`. Branch protection should require reviews from non-author humans. |
| Exfiltrate secrets | The token is scoped to a single repo (fine-grained PAT) or to the project + repo (classic PAT). Network egress in Actions is unrestricted — this is a known gap. See "Hardening" below. |
| Destructive commands | `AGENTS.md` says "never run destructive commands without an explicit human comment." This is honor-system; consider adding a `dangerous-commands` action that fails the workflow on patterns like `rm -rf`, `git reset --hard`, `gh repo delete`. |
| Persist a backdoor | `AGENTS.md` forbids modifying `AGENTS.md`, workflow files, and `CODEOWNERS`. Enable CODEOWNERS for these paths so even a successful PR can't merge without a human. |

## Token scopes

| Token | Minimum scope | Why |
|---|---|---|
| `AGENT_GH_TOKEN` (Projects v2) | `repo`, `project`, `read:org` (classic) **or** Issues/PR/Contents/Projects: RW (fine-grained) | Required for `kanban-cli`. |
| `MAVIS_API_KEY` (or equivalent) | API key from the agent vendor | Authenticates the agent. |
| `GITHUB_TOKEN` (default) | None — left unset if PAT is used | The composite actions accept `secrets.agent_gh_token \|\| secrets.github_token`. |

**Don't** use a PAT with broader scope than the consumer repo. If you use a classic PAT, the blast radius is "every repo you can access" — prefer a fine-grained PAT or a GitHub App.

## Hardening for production

1. **Enable branch protection on `main`.**
   - Require pull request reviews before merging (≥1).
   - Require status checks to pass (the agent's CI).
   - Require linear history.
   - **Do not** allow the agent's own token to bypass these.

2. **Add CODEOWNERS for the workflow and meta files.**

   ```
   # .github/CODEOWNERS
   /AGENTS.md                  @your-team
   /.github/                   @your-team
   /.github/workflows/         @your-team
   /packages/kanban-cli/       @your-team
   /docs/                      @your-team
   ```

   This way, even if the agent somehow opens a PR touching these, a human must approve.

3. **Set a per-workflow `permissions:` block** (already done in the boilerplate). Don't grant `actions: write` or `id-token: write` unless needed.

4. **Run triage on a separate, read-only token.** The `agent-scheduled-triage` workflow should not need write access.

5. **Limit network egress.** GitHub-hosted runners allow arbitrary egress by default. If you self-host, run the agent runner in a network namespace that can only reach `github.com` and your agent API.

6. **Rate-limit the agent.** The `timeout_minutes` input caps a single run, but you can also add a workflow-level `concurrency:` group (already done) and a daily-quota check.

7. **Audit agent runs.** The `Upload agent artifacts` step in `agent-runner` captures the full agent log. Consider extending it to upload a diff of what the agent did (`git diff origin/main...HEAD`) so a human reviewer can see exactly what changed.

8. **Don't auto-merge.** This is the default. The `agent-on-card` workflow stops at "In Review" — a human moves to "Done" after merge.

9. **Don't trust the agent's summary.** The PR description is a tool, not a guarantee. A human reviewer should still read the diff.

## Incident response

If the agent does something wrong:

1. **Close the PR** (do not merge).
2. **Delete the branch.**
3. **Move the card back to `Todo`** or close the issue.
4. **Check the run artifacts** for what the agent did.
5. **Update `AGENTS.md`** if a new class of misbehavior is possible. The agent reads it on every run.
6. **Rotate `AGENT_GH_TOKEN`** if you suspect the agent exfiltrated it.

## Reporting

If you find a bug in the boilerplate itself, please open an issue with `[security]` in the title. Do not disclose security-sensitive details in a public issue until a fix is out.
