---
name: pr-ready
description: Pre-PR flight check on the current branch. Re-anchors on the intended change and reviews the diff against it at a macro level — scope, completeness, drift — flags risky or sensitive changes for the reviewer, and drafts a compact PR title (conventional-commit style) and description. Requires a clean working tree. Does not run tests, lint, or type-check, and is not a substitute for line-level code review.
disable-model-invocation: true
---

# PR Pre-Flight Reviewer

A focused macro pass before opening a pull request, run *after* ordinary code review. It assumes the lines are already reviewed; its job is to re-anchor on what the change was *meant* to do and check the diff against that — catching a session that drifted, even when the code it produced looks fine. Three outputs: a faithful **summary** (the PR title and description are the source of truth for release notes), a **scope check** (is the intent fully and proportionately delivered, no drift?), and a **look-forward** pass (what should the reviewer focus on; what could bite users or maintainers?).

## When to use

- The user explicitly invoked this skill or asked for a pre-PR check.
- The work feels done; what's left is deciding whether to push and open the PR.

Do not auto-invoke on general "review my code" or "what do you think?" prompts.

## Phase 1 — Precondition: clean working tree

Run `git status --porcelain`. If the output is non-empty (any modified, staged, or untracked files), **stop** and tell the user:

> Commit or stash your changes first. A pre-PR review only makes sense on a clean state — otherwise we'd be reviewing a moving target.

Do not proceed until the tree is clean.

## Phase 2 — Determine intent (infer, then confirm)

The whole review hinges on knowing what the change was *supposed* to do.

1. If the user passed an intent string with the invocation (e.g. `/pr-ready add X to Y`), use it as the intent. Skip to Phase 3.
2. Otherwise, gather signals:
   - Recent turns in the current chat
   - Current branch name: `git branch --show-current`
   - Commit subjects since the merge-base with the default branch (see Phase 3 for how to find it): `git log --oneline --no-merges $(git merge-base "$default_branch" HEAD)..HEAD`
3. Synthesize a single sentence of inferred intent and present it:

   > Inferred intent: *"<one sentence>"*. Correct as-is, or refine?

4. Wait for the user to confirm or correct. Lock the intent before moving on.

## Phase 3 — Gather the diff

First, find the repo's default branch — it's usually `main` but older repos use `master`. Prefer the symbolic ref on the remote, fall back to whichever local branch exists:

```bash
default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
[ -z "$default_branch" ] && git show-ref --verify --quiet refs/heads/main   && default_branch=main
[ -z "$default_branch" ] && git show-ref --verify --quiet refs/heads/master && default_branch=master
```

If neither resolves, ask the user which branch to diff against rather than guessing.

Then scope the review to what this branch actually added (the merge-base sidesteps drift on the default branch):

```bash
base=$(git merge-base "$default_branch" HEAD)
git log --oneline --no-merges "$base..HEAD"   # commit list with subjects
git diff --stat "$base..HEAD"                  # file-level overview
git diff "$base..HEAD"                          # full content diff
```

`--no-merges` drops `Merge branch 'main'`-style commits that only pulled the default branch back in — not this branch's own work. The merge-base already scopes the diff to this branch's edits (including conflict resolutions). Since merges are squashed here, don't review commits for hygiene — the commit list only helps infer intent and scope.

Read the full diff. For larger changes, use `--stat` first to plan where to look closest.

## Phase 4 — Analyze

Re-read the locked intent, then judge the diff against it at a **macro level** — not a second line-level review (that's already done), but a check on whether this is still the right change, whole and no more. Note `file:line` for concrete, locatable items.

1. **Scope** — Does every hunk serve the intent? Flag scope creep, accidental edits, refactors that snuck in, drive-by formatting. A diff that doesn't fit a single intent is a signal the PR is doing too much.
2. **Completeness & proportion** — Measured against the intent, not as standalone code quality:
   - *Under-delivered* — is the intent actually finished, or left half-built or stubbed?
   - *Over-delivered / drifted* — did it grow past the intent (gold-plating, speculative generality, unrelated refactors)?
   - *Companions* — does the change carry what makes it complete for this intent: tests for the new behavior, and docs/types/comments that describe it?
3. **Loose ends & artifacts** — Diff-local things that shouldn't ship: leftover `console.log`/debug branches/commented-out code/stray `TODO` from this change, unused imports; and files that don't belong (editor configs, local env files, build outputs, unrelated lockfile churn).
4. **Risks / heads-up** — What should the reviewer look at hardest, and what could bite users or maintainers later? Behavior changes in shared code, removed or renamed exports, signature or default changes on public APIs, error-handling changes, data migrations — anything subtle that could break callers or surprise users.

## Phase 5 — Report

Output a single compact report in this order.

```
## Summary
<what this branch does — the basis for the PR description>

## Scope & completeness
<intent in a phrase; aligned or deviations; under/over-delivery; missing tests or docs; loose ends — with file:line>

## Risks / heads-up
- <what to review hardest, or a one-line "low risk" note>

## Suggested PR title
<one line, ready to paste>

## Suggested PR description
<markdown block, ready to paste>
```

Be honest about emptiness: "Scope: aligned and complete" or "Low risk — isolated change" is a complete section. A short, true section beats a padded one; never invent findings to make a section look substantial.

### Suggested PR title: format

Follow Conventional Commits. Pick the prefix that best matches the dominant change in the diff:

- `feat:` — new user-facing functionality
- `fix:` — bug fix
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `perf:` — performance improvement
- `docs:` — documentation only
- `test:` — adding or correcting tests
- `build:` / `ci:` — build system or CI changes
- `chore:` — tooling, deps, housekeeping that doesn't fit the above
- `revert:` — reverts a previous commit

Optional scope in parentheses when the repo already uses it (look at recent `git log` to confirm style): `feat(lib-node): add /heap-snapshot endpoint`.

Style:
- Imperative mood, lowercase after the colon, no trailing period.
- Aim for ≤ 72 characters so it doesn't truncate in GitHub.
- If the changes don't fit a single prefix, that's a signal the PR is doing too much — flag it under "Scope & completeness" rather than papering over it with `chore:`.

### Suggested PR description: format

The most important output: reviewers read it first, and it becomes the release note.

Required content:
- **What changed**, in plain terms (one sentence to a few bullets, scaled to the change).
- **Why** — the intent, in the user's own words from Phase 2.

Optional:
- **Risks / heads-up** — include only when there's something the reviewer or a future maintainer should know (the items from Phase 4 vector 4). Omit the section entirely for low-risk changes rather than writing "none".

Length guidance: as compact as the change allows. A typo fix is one sentence. A multi-part feature is a short summary plus a tight bullet list. **No filler, no test-plan boilerplate, no marketing tone.** If you find yourself padding, stop.

Line breaks: **no superfluous blank lines.** Insert one only at a genuine section break (before a `**Why:**` block or a bullet list) — not between every sentence, not as padding, not leading or trailing.

Example, for a small feature:

```markdown
Title: feat(import): add --dry-run flag to preview changes without writing

Add `--dry-run` flag to the import command so users can preview changes without writing.

**Why:** requested by ops to validate large imports before committing.

**Heads-up:** the new flag short-circuits before the DB transaction — double-check no downstream code assumed the transaction always runs.
```

### Persist to files

After printing the report, write the title and body to local files so the user can copy them without terminal soft-wraps inserting stray line breaks into the pasted text. Resolve the git directory via `git rev-parse --git-dir` — in a linked worktree, `.git` is a *file* (containing `gitdir: ...`), not a directory, so a hardcoded `.git/PR_BODY.md` path fails with "Not a directory":

```bash
git_dir=$(git rev-parse --git-dir)
printf '%s\n' "<title>" > "$git_dir/PR_TITLE"
cat > "$git_dir/PR_BODY.md" <<'EOF'
<body markdown>
EOF
```

The git directory is the right location: it's never committed, is scoped to this repo (or worktree, so parallel branches don't clobber each other), and persists across sessions. Don't write these files into the working tree — they'd risk being committed.

Then tell the user, in one short message, the **resolved** file paths and the platform-specific clipboard command. Substitute the actual value of `$git_dir` into the message — don't print the literal `$git_dir`:

> Wrote `<git_dir>/PR_TITLE` and `<git_dir>/PR_BODY.md`. To copy the body:
> - Wayland: `wl-copy < <git_dir>/PR_BODY.md`
> - X11: `xclip -selection clipboard < <git_dir>/PR_BODY.md`
> - macOS: `pbcopy < <git_dir>/PR_BODY.md`

## Red flags — do not skip these

- Tree not clean → stop, do not review.
- Intent unclear after inference → ask, do not guess silently.
- Long list of "nice to have" cleanup → keep it tight; only call out things that actually matter for this PR.
- Manufacturing findings to make a section look substantial → stop. "Scope: aligned" and "Low risk" are valid results.
- Sliding into line-level code review → stop. That pass is already done; stay at the scope-and-intent altitude.
