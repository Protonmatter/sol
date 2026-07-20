#!/usr/bin/env bash
#
# watch-ci.sh — Watch GitHub Actions checks for a PR (or a branch's latest run),
#               report status live as it changes, and optionally merge when green.
#
# This is the loop you'd otherwise babysit by hand: poll the checks, print each
# transition, and take an action on the terminal state (all-green -> merge,
# any-failure -> report + exit non-zero).
#
# Requirements
#   - gh   (GitHub CLI), authenticated once with:  gh auth login
#   - jq
#
# Usage
#   watch-ci.sh <pr-number> [options]
#   watch-ci.sh --branch <branch> [options]
#
# Options
#   -R, --repo OWNER/REPO   Target repo (default: the repo of the current dir)
#   -i, --interval SECONDS  Poll interval           (default: 30)
#   -t, --timeout SECONDS   Give up after this long  (default: 3600)
#   -m, --merge METHOD      On all-green, merge with: squash | merge | rebase
#       --rerun-failed      On failure, re-run only the failed jobs, then keep watching
#       --branch BRANCH     Watch the latest workflow run on BRANCH instead of a PR
#       --workflow NAME     (branch mode) Restrict to this workflow name/file
#   -q, --quiet             Only print terminal result and errors
#   -h, --help              This help
#
# Exit codes
#   0  all checks passed (and merged, if --merge was given)
#   1  at least one check failed
#   2  timed out while still pending
#   3  no checks found for the target
#   127 missing dependency (gh / jq)
#
# Examples
#   watch-ci.sh 10 -R Protonmatter/sol
#   watch-ci.sh 10 -R Protonmatter/sol --merge squash
#   watch-ci.sh 10 --merge squash --rerun-failed -i 20
#   watch-ci.sh --branch my-feature -R owner/repo --workflow ci.yml
#
set -euo pipefail

# ---------------------------------------------------------------- defaults ----
REPO=""
PR=""
BRANCH=""
WORKFLOW=""
INTERVAL=30
TIMEOUT=3600
MERGE_METHOD=""
RERUN_FAILED=0
QUIET=0

die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; }

# ------------------------------------------------------------- arg parsing ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    -R|--repo)      REPO="${2:?}"; shift 2 ;;
    -i|--interval)  INTERVAL="${2:?}"; shift 2 ;;
    -t|--timeout)   TIMEOUT="${2:?}"; shift 2 ;;
    -m|--merge)     MERGE_METHOD="${2:?}"; shift 2 ;;
    --rerun-failed) RERUN_FAILED=1; shift ;;
    --branch)       BRANCH="${2:?}"; shift 2 ;;
    --workflow)     WORKFLOW="${2:?}"; shift 2 ;;
    -q|--quiet)     QUIET=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    -*)             die "unknown option: $1 (try --help)" ;;
    *)              PR="$1"; shift ;;
  esac
done

case "$MERGE_METHOD" in ""|squash|merge|rebase) ;; *) die "--merge must be squash|merge|rebase" ;; esac
[[ -n "$PR" || -n "$BRANCH" ]] || die "give a PR number or --branch (try --help)"
[[ -z "$PR" || -z "$BRANCH" ]] || die "use a PR number OR --branch, not both"
[[ -z "$MERGE_METHOD" || -z "$BRANCH" ]] || die "--merge only applies to PR mode"

# ------------------------------------------------------------ preconditions ---
command -v gh >/dev/null 2>&1 || { echo "error: gh (GitHub CLI) not installed — https://cli.github.com" >&2; exit 127; }
command -v jq >/dev/null 2>&1 || { echo "error: jq not installed" >&2; exit 127; }
gh auth status >/dev/null 2>&1 || die "gh is not authenticated — run: gh auth login"

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
  [[ -n "$REPO" ]] || die "--repo not given and not inside a GitHub repo"
fi

# ------------------------------------------------------------------ colors ----
if [[ -t 1 ]]; then
  C_G=$'\033[32m'; C_R=$'\033[31m'; C_Y=$'\033[33m'; C_D=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_G=""; C_R=""; C_Y=""; C_D=""; C_B=""; C_0=""
fi
log() { [[ "$QUIET" == 1 ]] || printf '%s\n' "$*"; }
ts()  { date -u +%H:%M:%SZ; }

# ---------------------------------------------------- normalized check feed ---
# Emits one line per check:  <bucket>\t<name>\t<link>
# bucket is one of: pass | fail | pending | skipping | cancel
snapshot() {
  if [[ -n "$PR" ]]; then
    # gh pr checks already normalizes to a `bucket` field.
    gh pr checks "$PR" --repo "$REPO" --json name,bucket,link 2>/dev/null \
      | jq -r '.[] | [.bucket, .name, (.link // "")] | @tsv'
  else
    local run_id
    run_id="$(gh run list --repo "$REPO" --branch "$BRANCH" \
                ${WORKFLOW:+--workflow "$WORKFLOW"} --limit 1 \
                --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
    [[ -n "$run_id" ]] || return 0
    gh run view "$run_id" --repo "$REPO" --json jobs 2>/dev/null | jq -r '
      .jobs[] | [
        (if .status != "completed" then "pending"
         elif .conclusion == "success" then "pass"
         elif .conclusion == "skipped" then "skipping"
         elif .conclusion == "cancelled" then "cancel"
         else "fail" end),
        .name, (.url // "")
      ] | @tsv'
  fi
}

# ------------------------------------------------------- rerun failed jobs ----
rerun_failed_jobs() {
  local head run_id
  if [[ -n "$PR" ]]; then
    head="$(gh pr view "$PR" --repo "$REPO" --json headRefName -q .headRefName 2>/dev/null || true)"
  else
    head="$BRANCH"
  fi
  [[ -n "$head" ]] || return 1
  run_id="$(gh run list --repo "$REPO" --branch "$head" ${WORKFLOW:+--workflow "$WORKFLOW"} \
              --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || true)"
  [[ -n "$run_id" ]] || return 1
  log "${C_Y}Re-running failed jobs in run ${run_id}...${C_0}"
  gh run rerun "$run_id" --repo "$REPO" --failed 2>/dev/null
}

# ----------------------------------------------------------------- watch -----
target="${PR:+PR #$PR}"; target="${target:-branch $BRANCH}"
log "${C_B}Watching ${target} in ${REPO}${C_0} ${C_D}(every ${INTERVAL}s, timeout ${TIMEOUT}s)${C_0}"

declare -A last_bucket=()
start_epoch="$(date +%s)"
reran=0

while :; do
  now_epoch="$(date +%s)"
  if (( now_epoch - start_epoch > TIMEOUT )); then
    log "${C_R}✗ Timed out after ${TIMEOUT}s with checks still pending.${C_0}"
    exit 2
  fi

  # Tolerate a transient API hiccup: warn, wait, retry (don't die mid-watch).
  if ! feed="$(snapshot)"; then
    log "${C_D}$(ts)  transient API error; retrying in ${INTERVAL}s${C_0}"
    sleep "$INTERVAL"; continue
  fi

  if [[ -z "$feed" ]]; then
    # No checks yet (run may not have registered). Keep waiting until timeout.
    log "${C_D}$(ts)  no checks reported yet...${C_0}"
    sleep "$INTERVAL"; continue
  fi

  total=0 pass=0 fail=0 pending=0 other=0
  declare -a failed_names=()
  while IFS=$'\t' read -r bucket name link; do
    [[ -n "$name" ]] || continue
    total=$((total+1))
    case "$bucket" in
      pass)               pass=$((pass+1)) ;;
      fail)               fail=$((fail+1)); failed_names+=("$name  ${C_D}${link}${C_0}") ;;
      pending|"")         pending=$((pending+1)) ;;
      skipping|cancel)    other=$((other+1)) ;;
      *)                  pending=$((pending+1)) ;;
    esac
    # Print only transitions, so the log reads as a timeline of changes.
    if [[ "${last_bucket[$name]:-}" != "$bucket" ]]; then
      case "$bucket" in
        pass)     mark="${C_G}✓ pass${C_0}" ;;
        fail)     mark="${C_R}✗ fail${C_0}" ;;
        pending)  mark="${C_Y}• running${C_0}" ;;
        skipping) mark="${C_D}– skipped${C_0}" ;;
        cancel)   mark="${C_D}– cancelled${C_0}" ;;
        *)        mark="$bucket" ;;
      esac
      log "$(ts)  ${mark}  ${name}"
      last_bucket[$name]="$bucket"
    fi
  done <<< "$feed"

  # ---- terminal states -------------------------------------------------
  if (( fail > 0 )); then
    if (( RERUN_FAILED == 1 && reran == 0 )); then
      reran=1
      if rerun_failed_jobs; then
        # reset transition memory so the reran jobs report fresh
        last_bucket=(); sleep "$INTERVAL"; continue
      fi
      log "${C_Y}Could not auto-rerun; treating as failed.${C_0}"
    fi
    log ""
    log "${C_R}✗ ${fail}/${total} check(s) failed:${C_0}"
    for f in "${failed_names[@]}"; do log "    ${f}"; done
    exit 1
  fi

  if (( pending == 0 && total > 0 )); then
    log ""
    log "${C_G}✓ All ${total} check(s) green${other:+ (${other} skipped/cancelled)}.${C_0}"
    if [[ -n "$MERGE_METHOD" && -n "$PR" ]]; then
      log "Merging PR #${PR} (--${MERGE_METHOD})..."
      if gh pr merge "$PR" --repo "$REPO" "--${MERGE_METHOD}"; then
        log "${C_G}✓ Merged PR #${PR}.${C_0}"
      else
        log "${C_R}✗ Merge failed (branch protection / conflict / permissions?).${C_0}"
        exit 1
      fi
    fi
    exit 0
  fi

  log "${C_D}$(ts)  ${pass}/${total} passed, ${pending} running${other:+, ${other} skipped}...${C_0}"
  sleep "$INTERVAL"
done
