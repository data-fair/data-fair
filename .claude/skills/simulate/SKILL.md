---
name: simulate
description: Run the scenario simulations - drive real browser conversations with a simulated user, then dispatch a judge per transcript. Use when asked to run the simulations, or after changing a system prompt, a tool description, or the chat orchestration.
---

# Running the scenario simulations

Unit and e2e tests answer "does this mechanism work". This answers "did a person
get what they came for", by having a simulated one try and then judging the
transcript.

## Before you start

Three things must be true, and each fails confusingly if it is not:

1. The dev stack is up — `bash dev/status.sh`.
2. The UI is built — `ls ui/dist/index.html`. If it is missing, e2e-style runs
   fail with "element not found".
3. The bridge is running — `npm run dev-bridge`. The runner checks this and says so.

Ask the user to start anything that is down. Never start or stop dev processes yourself.

A run calls `clean()`, which deletes every `test_`-owned dataset in the dev
environment. Do not run simulations while someone is relying on that data.

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
   SIM_CASES=trouver-un-jeu-de-donnees npm run simulate  # one case
   ```

   Models are pinned by `SIM_ASSISTANT_MODEL` (default `sonnet`) and
   `SIM_USER_MODEL` (default `haiku`), and recorded per run, so verdicts from
   different tiers are never compared silently.

4. **Ignore the runner's own account of how it went.** The transcript at
   `simulations/tmp/sim-<case>.json` is the evidence. A Playwright `passed` line
   means the run was valid, not that the product behaved.

   A case whose sidecar says `valid: false` must NOT be judged — read
   `simulations/tmp/sim-<case>.run.json` for the recorded error instead.

5. **Dispatch one `simulation-judge` subagent per valid case.** Give it paths, not
   pasted content — transcripts carry every gateway request:

   - the case name and its goal
   - the transcript path, `simulations/tmp/sim-<case>.json`
   - ask for the JSON verdict its own definition specifies

6. **Write each verdict** to `simulations/tmp/sim-<case>.verdict.json` as raw JSON.
   Strip any code fence the judge added. A malformed verdict reports as
   `not judged`, which is deliberate — check the file rather than being surprised.

7. **Report.**

   ```bash
   npm run simulate:report
   ```

   Relay the summary and the friction list. Exit code is non-zero if any case was
   unsatisfactory, invalid, not judged, or never ran.

## Reading the result

The friction list is the point. "Unsatisfactory" tells you a run went badly; a
friction point names the reply or tool result that misled the person and what they
did next — that is what turns a run into a concrete change.

Rate limits are the practical ceiling: three Claude roles per case on one
subscription. A run cut short by a rate limit is an **invalid run**, not a product
failure — check the sidecar before concluding anything.
