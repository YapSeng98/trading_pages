#!/usr/bin/env bash
# Last step of the market job (.github/workflows/market.yml): keeps the data jobs going without GitHub's timer.
#
# Why: GitHub delivers this repository's timers hours late and drops most of the 15-minute ones. Measured 2026-11-15
# from the run history: about 5 market runs a day instead of 96, and the twice-daily stock quotes 6 to 10 hours after
# their time. Runs started by a push or by another run start within seconds. So every market run does two things here:
#
#   1. Stock quotes: when one of quotes.yml's times (08:20 SGT Tue-Sat, 17:40 SGT Mon-Fri) has passed and no quotes run
#      has started since, start one.
#   2. The next market run: start it now. It first waits in the "tick" environment (a wait timer: no machine is used
#      while it waits), then runs and starts the one after. Only when that environment exists with a wait timer of
#      5 minutes or more, which the owner sets once in the repository's settings (CLAUDE.md, "Data jobs"); without the
#      timer a started run would begin at once and the chain would spin, so nothing is started. Deleting the
#      environment, or its timer, stops the chain; the timers above then carry on as before.
#
# Only one chain: a run is started only when no other started run is waiting or running. A chain that breaks (a failed
# run, a cancelled one) is started again by the next run of any kind.
# Needs GH_TOKEN (the workflow's own token, with actions: write), GITHUB_REPOSITORY and GITHUB_RUN_ID. Never fails the job.
set +e
repo="${GITHUB_REPOSITORY:?}"; me="${GITHUB_RUN_ID:-0}"
# what was decided, as a line in the log and as a notice on the run (notices of a public repository can be read without signing in)
say() { echo "$1"; echo "::notice title=Keep going::$1"; }

# ---- 1. stock quotes when their own timer is late
due=$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
sgt = timezone(timedelta(hours=8)); now = datetime.now(sgt); slots = []
for back in range(8):
    d = now - timedelta(days=back)
    for hh, mm, days in ((8, 20, (1, 2, 3, 4, 5)), (17, 40, (0, 1, 2, 3, 4))):      # Monday is 0
        t = d.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if d.weekday() in days and t <= now:
            slots.append(t)
print(max(slots).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
PY
)
last=$(gh run list --repo "$repo" --workflow quotes.yml --limit 1 --json createdAt --jq '.[0].createdAt // ""' 2>/dev/null)
if [[ -n "$due" && -n "$last" && "$last" < "$due" ]]; then
  gh workflow run quotes.yml --repo "$repo" --ref main && say "Stock quotes: due at $due, last run $last: started."
else
  say "Stock quotes: nothing due (last due time $due, last run ${last:-unknown})."
fi

# ---- 2. the next market run
timer=$(gh api "repos/$repo/environments/tick" --jq '[.protection_rules[]? | select(.type == "wait_timer") | .wait_timer] | first // 0' 2>/dev/null)
case "$timer" in ''|*[!0-9]*) timer=0 ;; esac
if [ "$timer" -lt 5 ]; then
  say "Next run: not started. There is no 'tick' environment with a wait timer of 5 minutes or more; GitHub's timer still runs the job."
  exit 0
fi
others=$(gh run list --repo "$repo" --workflow market.yml --event workflow_dispatch --limit 30 --json databaseId,status --jq "[.[] | select(.status != \"completed\" and .databaseId != $me)] | length" 2>/dev/null)
case "$others" in ''|*[!0-9]*) say "Next run: the run list could not be read; left to the next run."; exit 0 ;; esac
if [ "$others" -gt 0 ]; then
  say "Next run: one is already waiting or running ($others)."
  exit 0
fi
gh workflow run market.yml --repo "$repo" --ref main -f chain=yes && say "Next run: started; it waits $timer minutes in 'tick' first."
exit 0
