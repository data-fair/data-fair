---
name: agents-sim
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
3. The bridge is running — it has a `bridge` pane in the zellij layout, and
   `bash dev/status.sh` reports it as `dev-bridge (opt)`. The runner checks it
   and says so. Only the maintainer starts it (`npm run dev-bridge`).

Ask the user to start anything that is down. Never start or stop dev processes yourself.

A run calls `clean()`, which wipes the dev environment's test state — see the warning
in AGENTS.md's Simulations section for exactly what it deletes. Do not run simulations
while someone is relying on that data.

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
   moderation guard) and `SIM_USER_MODEL` (default `haiku`), and recorded per
   run, so verdicts from different tiers are never compared silently.

4. **Ignore the runner's own account of how it went.** The transcript at
   `simulations/tmp/sim-<case>.json` is the evidence. A Playwright `passed` line
   means the run was valid, not that the product behaved.

   A case whose sidecar says `valid: false` must NOT be judged — read
   `simulations/tmp/sim-<case>.run.json` for the recorded error instead.

5. **Dispatch one `simulation-judge` subagent per valid case.** Give it paths, not
   pasted content — transcripts carry every gateway request:

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
