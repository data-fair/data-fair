---
name: pr-ready
description: Pre-PR flight check on the current branch. Reviews the diff against stated intent, flags scope creep, regression risks, and commit hygiene problems, and drafts a compact PR title (conventional-commit style) and description. Requires a clean working tree. Does not run tests, lint, or type-check.
disable-model-invocation: true
---

# PR Pre-Flight Reviewer

A focused review pass before opening a pull request. The goal is a PR that is easy on the reviewer: tight scope, no bloat, surprises called out up front.

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

`--no-merges` drops commits like `Merge branch 'main'` that only pulled the default branch back into this one — they aren't this branch's own work and shouldn't be analyzed under commit hygiene or intent. The diff itself is already scoped via the merge-base, so changes brought in by those merges don't appear in `git diff "$base..HEAD"` either; only edits actually made on this branch (including any conflict resolutions in the merge commit) show up.

Read the full diff. For larger changes, use `--stat` first to plan where to look closest.

## Phase 4 — Analyze against five vectors

For each vector, note specific findings with `file:line` references when applicable.

1. **Intent alignment** — Does every hunk serve the stated intent? Flag scope creep, accidental edits, refactors that snuck in, drive-by formatting.
2. **Code smells / bloat** — `console.log`, `print`, leftover `TODO`/`FIXME` from this change, commented-out code, debug branches, unused imports, over-verbose logic, unnecessary new abstractions.
3. **Artifacts** — Files that shouldn't be in a PR: editor configs, local env files, build outputs, generated files that should be gitignored, lockfile changes unrelated to dependency edits.
4. **Regression risks** — Behavior changes in shared code, removed or renamed exports, signature changes on public APIs, changes to defaults, error-handling changes, anything subtle that could break callers. Each item must be specific enough that the reviewer and the developer can decide whether it's intentional.
5. **Commit hygiene** — Fix-up / "wip" / vague-message commits, commits that should be squashed, messages that don't match what the commit actually changes. If the chain is messy, suggest a concrete squash/rewrite plan.

## Phase 5 — Report

Output a single compact report in this order. If a section has nothing to say, write "No issues" rather than omitting it.

```
## Summary
<two sentences max: what this branch does>

## Intent check
<aligned, or list deviations>

## Cleanup
- <bullets with file:line where useful>

## Regression flags
- <each one specific and actionable>

## Commit hygiene
- <bullets; include a squash plan if needed>

## Suggested PR title
<one line, ready to paste>

## Suggested PR description
<markdown block, ready to paste>
```

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
- If the branch already has a single, well-formed conventional commit, reuse its subject as the title rather than inventing a new one.
- If the changes don't fit a single prefix, that's a signal the PR is doing too much — flag it under "Intent check" rather than papering over it with `chore:`.

### Suggested PR description: format

The PR description is the most important output. Reviewers read it first; if it's good, the rest of the review goes faster.

Required content:
- **What changed**, in plain terms (one sentence to a few bullets, scaled to the change).
- **Why** — the intent, in the user's own words from Phase 2.
- **Regression risks** — the items from Phase 4 vector 4, restated for the reviewer. This is the most critical section; it lets the reviewer focus their attention where it matters.

Length guidance: as compact as the change allows. A typo fix is one sentence. A multi-part feature is a short summary plus a tight bullet list. **No filler, no test-plan boilerplate, no marketing tone.** If you find yourself padding, stop.

Example, for a small feature:

```markdown
Title: feat(import): add --dry-run flag to preview changes without writing

Add `--dry-run` flag to the import command so users can preview changes without writing.

**Why:** requested by ops to validate large imports before committing.

**Regression risks:**
- Default behavior unchanged, but the new flag short-circuits before the DB transaction — double-check no downstream code assumed the transaction always runs.
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
- Regression section empty on a non-trivial diff → re-check. Most non-trivial diffs have at least one risk worth flagging.
