# Scaleway lock-prolongation validation spike — design

> Status: approved design, spike not yet run. Companion to
> [docs/architecture/integrity.md](../architecture/integrity.md) §3.4 / §12.

## Goal

Empirically confirm (or refute) that **extending a compliance-mode object-lock retention**
works on Scaleway Object Storage. The operation under test is exactly what
`IntegrityStore.extendRetention()` (`api/src/integrity/store.ts`) issues —
`PutObjectRetention` with `Mode: COMPLIANCE` and a **later** `RetainUntilDate` — and what the
sliding checker's renewal (`maybeRenew`, `api/src/integrity/checker.ts`) depends on.

`integrity.md` §12 flags a reported Scaleway defect on this exact operation (the Veeam
incompatibility) as a **blocking prerequisite**:

- **PASS** → the shipped Option B renewal model (§3.4, lock renewal by extension) is validated
  on the target provider; the blocker is closed.
- **FAIL** → Option B is not viable on Scaleway; re-anchoring (§3.4 Option A) is promoted from
  deferred fallback to required work.

## Method

A step-by-step **aws-cli runbook** (numbered command blocks with expected output). The user
runs the blocks with the existing `--profile scw-staging` credentials (per the house pattern
in `~/koumoul/infrastructure/s3-buckets/`) and pastes outputs back; the outputs are analyzed
and the verdict recorded in `integrity.md`.

Rejected variant: driving the test through the actual Node `IntegrityStore` code. Closer to
production in appearance, but the aws cli issues byte-identical S3 API calls, and the cli
avoids exposing credentials to a workspace process — the extra fidelity is negligible.

## Setup

One throwaway bucket in the **staging** Scaleway project:

- name `staging-integrity-lock-spike`, created with `--object-lock-enabled-for-bucket`
  (versioning is implied by object lock);
- a bucket-level `DefaultRetention: { Mode: COMPLIANCE, Days: 1 }` rule — the default rule
  doubles as test case B.

Test objects are a few bytes. Worst-case liability: a handful of undeletable tiny objects for
≤ 2 days in a staging-project bucket.

## Test cases

- **A — inline lock (the `store.ts` path, core).** Put an object with an inline `COMPLIANCE`
  lock at now+1h → read the retention back → extend to now+2h **without** `--version-id`
  (`store.ts` targets the latest version implicitly) → verify the new date → extend once more
  **with** an explicit `--version-id` (parity check).
- **A′ — negative controls.** Attempt to *shorten* the retention (expect rejection) and to
  delete the locked version (expect `AccessDenied`). Proves the lock is a real compliance
  lock, so a PASS on extension is meaningful.
- **B — default-bucket-retention lock.** Put an object with **no** inline lock → confirm it
  inherited `COMPLIANCE` + 1 day from the bucket rule → extend to +2 days → verify.
  (Production §3.1 plans a bucket default; `store.ts` writes inline — both lock origins must
  be extendable.)
- **C — Glacier.** Put with `--storage-class GLACIER` + inline compliance lock → read the
  retention → extend → verify. (§3.1 deems Glacier acceptable for the cold store.)

Deliberately out of scope (per scoping discussion): year-scale durations — day/hour-scale
extensions are taken as representative, avoiding a 1-year-undeletable test object.

## Verdict criteria

A case **PASSes only if the read-back `RetainUntilDate` equals the extended date** — a 200 on
the put alone is not sufficient. Any error, or a silently unchanged date, is a **FAIL**,
recorded verbatim in the results.

## Cleanup

After the last retention expires (≤ 2 days after the run), a final runbook section deletes
all object versions and the bucket.

## Recording the result

Update `docs/architecture/integrity.md`:

- §12: the "Scaleway prolong-lock bug — BLOCKING" entry gets the verdict and validation date
  (shrinks to a resolved note on PASS);
- §3.4: the dependency callout under Option B is updated accordingly;
- on FAIL: §10's target-1 next-steps line promotes Option A (re-anchoring) from
  "implemented only if the bug is confirmed to still block us" to required work.

The raw runbook outputs are appended to this document as a results section.
