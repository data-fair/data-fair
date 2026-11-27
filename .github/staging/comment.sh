#!/usr/bin/env bash
# Tell the pull requests of a staging rebuild whether they are in: one comment per pull request, found by
# its marker and edited in place. A pull request left out gets the comment; one that is back in gets it
# updated; one that never was left out gets nothing.
#
# usage: comment.sh <owner/repo> <rebuild output.json> <run url>

set -euo pipefail

repo="$1"
input="$2"
run_url="$3"
marker='<!-- staging-rebuild -->'

upsert() {
  local number="$1" body="$2" only_update="$3" id
  id=$(gh api "repos/$repo/issues/$number/comments" --paginate \
    --jq "[.[] | select(.body | startswith(\"$marker\"))] | first | .id // empty")
  if [ -n "$id" ]; then
    gh api -X PATCH "repos/$repo/issues/comments/$id" -f body="$body" > /dev/null
  elif [ "$only_update" = false ]; then
    gh api -X POST "repos/$repo/issues/$number/comments" -f body="$body" > /dev/null
  fi
}

for excluded in $(jq -r '.excludedPullRequests[] | "\(.number):\(.reason)"' "$input"); do
  number="${excluded%%:*}"
  case "${excluded#*:}" in
    workflow-files) why="it changes workflow files, which the staging rebuild may not push. It can be validated on staging once merged into the default branch." ;;
    *) why="it does not merge cleanly into the default branch plus the pull requests merged before it. Rebase it on the default branch; the next rebuild will take it." ;;
  esac
  upsert "$number" "$marker
This pull request is labeled \`staging\` but was **left out of the staging branch** ($run_url): $why" false
done

for number in $(jq -r '.pullRequests[].number' "$input"); do
  upsert "$number" "$marker
This pull request is in the staging branch again ($run_url)." true
done
