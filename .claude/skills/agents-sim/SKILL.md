---
name: agents-sim
description: Run the scenario simulations - drive real browser conversations with a simulated user, then dispatch a judge per transcript. Use when asked to run the simulations, or after changing a system prompt, a tool description, or the chat orchestration.
---

# Running the scenario simulations

Unit and e2e tests answer "does this mechanism work". This answers "did a person
get what they came for", by having a simulated one try and then judging the
transcript.

## Before you start

Four things must be true, and each fails confusingly if it is not:

1. The dev stack is up — `bash dev/status.sh`.
2. The workspace packages are built — `ls lib-vue/*.js lib-vuetify/*.js`. If they
   are missing, e2e-style runs fail with "element not found".
3. `lib-sim` is built — `npm -w @data-fair/lib-agents-sim run build`.
   `simulations/` imports it by package name, not by relative path, so a stale
   build silently runs the OLD code and still reports the run valid — the exact
   failure mode this subsystem exists to catch.
4. The bridge is running — only the maintainer starts it (`npm run dev-bridge`). The runner checks this and says so.

Ask the user to start anything that is down. Never start or stop dev processes yourself.

## Steps

1. **Read the case list** in `simulations/cases/index.ts`. Note each `name` and `goal`.

2. **Delete evidence from earlier runs.**

   ```bash
   rm -f simulations/tmp/sim-*
   ```

   Evidence persists and is only rewritten by a case that actually runs. Without
   this, a case that fails to dispatch reports the previous run's verdict as
   though it were this one's. Deleting first turns that into a visible `not run`.

3. **Run the cases.**

   ```bash
   npm run simulate                              # every case
   SIM_CASES=lien-ouvert-par-l-utilisateur npm run simulate  # one case
   ```

   Models are pinned by `SIM_ASSISTANT_MODEL` (default `sonnet`),
   `SIM_TOOLS_MODEL` (default `haiku`, for sub-agents, compaction and the
   moderation guard) and `SIM_USER_MODEL` (default `sonnet`), and recorded per
   run, so verdicts from different tiers are never compared silently.

   The persona is on `sonnet` deliberately. On `haiku` it stopped enforcing its
   own goal: a case whose goal said the answer had to be shown on screen was
   ended with a chat-only reply and marked done, and another persona asserted it
   could see nothing but the chat while its own `look` had just returned the
   page. A persona that lets the product off the hook produces green runs that
   prove nothing. It is the most expensive knob here, so lower it deliberately,
   not by default.

   **Confirm it started.** A suite takes minutes, so you will want to background
   it — and a run that never launched looks exactly like a run still going. Check
   the runner's own log first, and the sidecar as the stronger signal:

   ```bash
   tail -5 sim.log                    # state-setup passing means it is going
   ls simulations/tmp/*.run.json      # a file here means a case really started
   ```

   The sidecar is written before each case's body, but AFTER the login fixture,
   which can take more than a minute on a cold page — so an empty
   `simulations/tmp/` on its own is not proof of a stall. A log with no progress
   at all is. Check the directory you are looking in, too: a backgrounded
   `cd X && … &` runs the `cd` in a subshell, so a later `ls` reads whatever
   directory you started from. One session read another repo's stale evidence
   that way and called a dead run healthy.

   **Wait on the process id, never on a text pattern.** `pgrep -f` matches full
   command lines, including the command line of the waiter you are writing — so

   ```bash
   until ! pgrep -f "playwright.sim.config"; do sleep 15; done   # WRONG
   ```

   matches itself and waits forever, silently, producing nothing. One session lost
   an hour and three quarters to exactly this, and then repeated it while trying to
   fix it. Capture the pid and watch that instead:

   ```bash
   nohup npm run simulate > sim.log 2>&1 &
   SIMPID=$!
   while kill -0 "$SIMPID" 2>/dev/null; do sleep 20; done
   ```

   For the same reason, never `pkill -f` a pattern taken from your own script.

4. **Ignore the runner's own account of how it went.** The transcript at
   `simulations/tmp/sim-<case>.json` is the evidence. A Playwright `passed` line
   means the run was valid, not that the product behaved.

   A case whose sidecar says `valid: false` must NOT be judged — read
   `simulations/tmp/sim-<case>.run.json` for the recorded error instead.

5. **Dispatch one `simulation-judge` subagent per valid case.** Give it paths, not
   pasted content — a run's conversation exports can run to megabytes:

   - the case name and its goal
   - the transcript path, `simulations/tmp/sim-<case>.json`
   - the sidecar path, `simulations/tmp/sim-<case>.run.json`
   - ask for the JSON verdict its own definition specifies

   **Dispatch them all the same way.** What to look at, what matters, what you
   suspect is wrong this time — none of that goes in the dispatch. The judge's
   own definition sets its mandate, and it reads `docs/architecture/` itself. A
   briefing you write per run steers the verdict toward what you already
   believed and makes two runs' verdicts incomparable. If a judge is looking in
   the wrong place, fix its definition, not one dispatch.

6. **Write each verdict** to `simulations/tmp/sim-<case>.verdict.json` as raw JSON.
   Strip any code fence the judge added. A malformed verdict reports as
   `not judged`, which is deliberate — check the file rather than being surprised.

7. **Report.**

   ```bash
   npm run simulate:report
   ```

   Relay the summary, the friction list and the findings. Exit code is non-zero
   if any case was unsatisfactory, invalid, not judged, or never ran.

8. **Root-cause what it found.** The judge reads a record, not the source: it
   says a tool result misled the assistant, not which line built that result.
   That half is yours, and it is where a run becomes a change. For each friction
   point and each finding worth acting on, go into the code, find what produced
   it, and say so — a defect you confirmed, a design decision the judge could
   not see, or a harness artefact. Report that, not the verdict verbatim.

## Reading the result

The friction list is the person's side, and it is what "unsatisfactory" is
actually about: which reply or tool result misled them and what they did next.
The findings are everything else the run exposed — cost, what the conversation
was like to read, tools, the product, the harness. Both are claims about a
record; both need confirming against the code before anyone acts on them.

Rate limits are the practical ceiling: three Claude roles per case on one
subscription. A run cut short by a rate limit is an **invalid run**, not a product
failure — check the sidecar before concluding anything.
