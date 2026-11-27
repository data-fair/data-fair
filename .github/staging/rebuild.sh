#!/usr/bin/env bash
# Rebuild the staging branch: the checked out default branch plus every open pull request labeled
# "staging" whose head branch is in this repository, merged oldest first. A pull request that does not
# merge cleanly ("conflict") or that changes workflow files ("workflow-files") is left out. Nothing is pushed: the workflow pushes HEAD to "staging".
#
# usage: rebuild.sh <owner/repo> <output.json>
# output: {"baseCommit", "pullRequests": [{number, title, url, sha}], "excludedPullRequests": [{number, title, url, reason}]}

set -euo pipefail

repo="$1"
output="$2"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

base=$(git rev-parse HEAD)
included='[]'
excluded='[]'

prs=$(gh pr list -R "$repo" --label staging --state open --limit 100 \
  --json number,title,url,headRefOid,isCrossRepository \
  --jq '[.[] | select(.isCrossRepository | not)] | sort_by(.number) | .[] | @base64')

for pr in $prs; do
  field() { echo "$pr" | base64 -d | jq -r ".$1"; }
  number=$(field number)
  title=$(field title)
  url=$(field url)
  sha=$(field headRefOid)
  git fetch --quiet origin "pull/$number/head"
  # the workflow's token may not push changes to workflow files: such a pull request would fail the
  # whole rebuild, so it is left out (it is validated once merged into the default branch)
  if [ -n "$(git diff --name-only "$base...$sha" -- .github/workflows)" ]; then
    echo "left out #$number $title (changes workflow files)"
    excluded=$(jq -c --argjson n "$number" --arg t "$title" --arg u "$url" \
      '. + [{number: $n, title: $t, url: $u, reason: "workflow-files"}]' <<< "$excluded")
    continue
  fi
  if git merge --quiet --no-ff --no-edit -m "staging: #$number $title" "$sha" >/dev/null 2>&1; then
    echo "merged #$number $title"
    included=$(jq -c --argjson n "$number" --arg t "$title" --arg u "$url" --arg s "$sha" \
      '. + [{number: $n, title: $t, url: $u, sha: $s}]' <<< "$included")
  else
    git merge --abort
    echo "left out #$number $title (conflict)"
    excluded=$(jq -c --argjson n "$number" --arg t "$title" --arg u "$url" \
      '. + [{number: $n, title: $t, url: $u, reason: "conflict"}]' <<< "$excluded")
  fi
done

jq -n -c --arg base "$base" --argjson included "$included" --argjson excluded "$excluded" \
  '{baseCommit: $base, pullRequests: $included, excludedPullRequests: $excluded}' > "$output"
cat "$output"
