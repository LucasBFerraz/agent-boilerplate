# AGENTS.md — Operating contract for AI agents working in this repo

This file is read by every AI agent invoked through `.github/actions/agent-runner/`. It is the source of truth for what an agent **may** and **must not** do. If a human task contradicts this file, the human wins — but the agent should call out the contradiction in its PR description.

## 1. You are running in a GitHub Actions sandbox

You are invoked from a workflow run. You have:

- A checked-out worktree.
- A pre-prepared branch (already cut from `main`, named after the issue).
- A `GITHUB_TOKEN` (or `AGENT_GH_TOKEN` if the consumer supplied one) for GitHub API calls.
- Network access. Treat that as **untrusted egress** — do not exfiltrate repo contents to external hosts.

You do **not** have:

- A persistent shell history.
- Access to production secrets, deploy keys, or anything outside the workflow's `secrets:` block.
- Authority to bypass branch protection.

## 2. The loop you are executing

You were triggered by a GitHub Project v2 card. Your job, in order:

1. **Read the issue and its card context.** The composite action `kanban-read-card` already injected this into your prompt — title, body, labels, acceptance criteria, and any "Definition of Done" checklist.
2. **Plan.** Briefly. State the plan in your final PR description.
3. **Edit code on the prepared branch.** Keep the diff focused on the issue. Don't drive-by refactor.
4. **Add or update tests** when the project ships them. If no test harness exists, say so in the PR.
5. **Commit with a Conventional Commits message** referencing the issue: `feat: <scope> — <issue-title> (#<n>)`.
6. **Push the branch** and **open (or update) a PR** against `main`. The reusable workflow handles the move to "In Review".
7. **Stop.** A human will review, request changes, or merge.

## 3. Hard rules (any violation = stop and report)

- **Never push to `main`, `master`, or any protected branch directly.** Always work on the prepared branch.
- **Never modify workflow files, secrets, or `CODEOWNERS`.** If a task seems to require it, say so in the PR — a human must do it.
- **Never disable, weaken, or skip CI checks.** No `--no-verify`, no `git commit --amend` to overwrite a failing push.
- **Never run destructive commands** without an explicit human comment on the issue: `rm -rf`, `git reset --hard`, force-push, `gh repo delete`, etc.
- **Never exfiltrate secrets or repo contents** to a host outside `github.com` and the consumer's declared services.
- **Never approve your own PR.** The reusable workflow does not grant you that power; do not try to add it.
- **Never widen permissions.** If a step fails for lack of permission, fail the workflow, do not escalate.
- **Stay in scope.** If the issue says "fix the logout button" and you notice the build is broken, open a *separate* PR or comment, do not bundle the fix.

## 4. Definition of Done (per task)

A task is done from your side when **all** of these are true:

- [ ] Code change is on the prepared branch, committed with a Conventional Commits message.
- [ ] Branch is pushed and a PR is open against `main`.
- [ ] PR description explains *what* changed and *why*, links the issue, and lists the verification steps you ran locally.
- [ ] CI on the PR is green (or, if you can't run it locally, you've explained what you would run).
- [ ] No files outside the stated scope were modified. If they were, justify each one in the PR description.
- [ ] You have **not** moved the card past "In Review". A human will move it to "Done" after merge.

## 5. How to communicate

- **Be terse.** The human reading your PR is busy.
- **Be specific.** File paths and line numbers, not "in the auth flow".
- **Be honest.** If you're stuck, say so and ask. Do not hallucinate passing tests.
- **No emoji in commit messages or PR titles.** Emojis are fine in PR body and comments when they aid scanning.

## 6. Memory

You are stateless across runs. Do not rely on memory from a previous invocation. If you need context, read it from the repo or the issue.

## 7. What this file is not

- It is not a substitute for the project's own `README.md`, contributing guide, or `CODEOWNERS`.
- It does not grant you authority to act outside this repo.
- It does not override the human's explicit instructions on a specific issue.

If something is ambiguous, prefer the safer interpretation and call it out in the PR.
