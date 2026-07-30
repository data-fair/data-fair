# Scaleway Lock-Prolongation Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empirically validate (or refute) that extending a compliance-mode object-lock retention (`PutObjectRetention`) works on Scaleway Object Storage, and record the verdict in the integrity architecture doc.

**Architecture:** A step-by-step aws-cli runbook executed by the user with the `scw-staging` profile against a throwaway object-lock bucket; outputs are pasted back, analyzed against explicit PASS criteria, and the verdict lands in `docs/architecture/integrity.md` (§3.4, §10, §12). Spec: [2026-07-16-scaleway-lock-prolongation-spike-design.md](2026-07-16-scaleway-lock-prolongation-spike-design.md).

**Tech Stack:** aws cli (s3api) against `https://s3.fr-par.scw.cloud`, GNU date, git.

## Global Constraints

- All aws commands use `--profile scw-staging` (house pattern from `~/koumoul/infrastructure/s3-buckets/`). If that profile does not carry an `endpoint_url`, every command additionally needs `--endpoint-url https://s3.fr-par.scw.cloud`.
- Bucket name: `staging-integrity-lock-spike`, in the staging Scaleway project only.
- Retentions in the spike never exceed **2 days** from the run date (worst-case undeletable liability).
- A case PASSes only if the **read-back** `RetainUntilDate` equals the extended date — an HTTP 200 alone is not a PASS.
- The agent never runs the aws commands itself: it hands numbered blocks to the user and analyzes pasted output (credentials live in another user space).

---

### Task 1: Author the runbook

**Files:**
- Create: `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md`

**Interfaces:**
- Produces: the runbook file whose numbered blocks (0–6) Task 2 hands to the user, and whose “Results” placeholders Task 2 fills.

- [ ] **Step 1: Write the runbook file**

Write `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md` with exactly this content:

````markdown
# Scaleway lock-prolongation spike — runbook

Run each block in order in a shell where `aws --profile scw-staging` works.
Paste each block's full output back for analysis. Blocks assume GNU `date`
(Linux). If the profile has no `endpoint_url`, add
`--endpoint-url https://s3.fr-par.scw.cloud` to every aws command.

Every block starts by (re)defining the variables it needs, so blocks survive
a new shell — but run block 0 first in any fresh shell.

## Block 0 — preflight

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
aws --version
aws s3api list-buckets --profile $PROFILE --query 'Buckets[].Name' --output json | head -20
```

Expected: aws cli v2.x; a JSON array of staging bucket names (e.g.
`staging-data-fair-data-backup`). Errors here mean the profile/endpoint is
not set up — stop and fix before continuing.

## Block 1 — throwaway bucket with object lock + 1-day default compliance retention

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
aws s3api create-bucket --profile $PROFILE --bucket $BUCKET --object-lock-enabled-for-bucket
aws s3api put-object-lock-configuration --profile $PROFILE --bucket $BUCKET \
    --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":1}}}'
aws s3api get-object-lock-configuration --profile $PROFILE --bucket $BUCKET
aws s3api get-bucket-versioning --profile $PROFILE --bucket $BUCKET
```

Expected: create-bucket returns a `Location`; get-object-lock-configuration
echoes the COMPLIANCE/1-day rule; get-bucket-versioning shows
`"Status": "Enabled"` (implied by object lock).

## Block 2 — case A: inline compliance lock, then extend (the core test)

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
echo "integrity spike case A" > /tmp/spike-a.txt
RETAIN_A1=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)
echo "initial retain-until: $RETAIN_A1"
aws s3api put-object --profile $PROFILE --bucket $BUCKET --key case-a --body /tmp/spike-a.txt \
    --object-lock-mode COMPLIANCE --object-lock-retain-until-date $RETAIN_A1
aws s3api get-object-retention --profile $PROFILE --bucket $BUCKET --key case-a

# extend WITHOUT --version-id (matches IntegrityStore.extendRetention, which targets the latest version)
RETAIN_A2=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)
echo "extended retain-until: $RETAIN_A2"
aws s3api put-object-retention --profile $PROFILE --bucket $BUCKET --key case-a \
    --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_A2"
aws s3api get-object-retention --profile $PROFILE --bucket $BUCKET --key case-a

# extend once more WITH an explicit --version-id (parity check)
VID_A=$(aws s3api head-object --profile $PROFILE --bucket $BUCKET --key case-a --query VersionId --output text)
echo "version id: $VID_A"
RETAIN_A3=$(date -u -d '+3 hours' +%Y-%m-%dT%H:%M:%SZ)
echo "re-extended retain-until: $RETAIN_A3"
aws s3api put-object-retention --profile $PROFILE --bucket $BUCKET --key case-a --version-id $VID_A \
    --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_A3"
aws s3api get-object-retention --profile $PROFILE --bucket $BUCKET --key case-a --version-id $VID_A
```

Expected: first get-object-retention shows COMPLIANCE + `$RETAIN_A1`; after
each put-object-retention the read-back `RetainUntilDate` equals `$RETAIN_A2`
then `$RETAIN_A3`. **Any error on the extends, or an unchanged read-back
date, is the reported Scaleway bug → case A FAILs.**

## Block 3 — case A′: negative controls (shorten + delete must be refused)

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
VID_A=$(aws s3api head-object --profile $PROFILE --bucket $BUCKET --key case-a --query VersionId --output text)

# 3a: attempt to SHORTEN the compliance retention — must be refused
RETAIN_SHORT=$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ)
aws s3api put-object-retention --profile $PROFILE --bucket $BUCKET --key case-a \
    --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_SHORT"

# 3b: attempt to DELETE the locked version — must be refused
# (delete-object WITHOUT --version-id would just add a delete marker and "succeed" — that is
# normal versioning behavior, not a lock failure, so the test targets the version explicitly)
aws s3api delete-object --profile $PROFILE --bucket $BUCKET --key case-a --version-id $VID_A
```

Expected: **both commands error** (AccessDenied or an
InvalidRequest-style refusal). If either succeeds, the "compliance" lock is
not a real lock → A′ FAILs and the whole premise needs rechecking.

## Block 4 — case B: lock inherited from the bucket default, then extend

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
echo "integrity spike case B" > /tmp/spike-b.txt
# no inline lock: retention must come from the bucket's DefaultRetention rule
aws s3api put-object --profile $PROFILE --bucket $BUCKET --key case-b --body /tmp/spike-b.txt
aws s3api get-object-retention --profile $PROFILE --bucket $BUCKET --key case-b

RETAIN_B=$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ)
echo "extended retain-until: $RETAIN_B"
aws s3api put-object-retention --profile $PROFILE --bucket $BUCKET --key case-b \
    --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_B"
aws s3api get-object-retention --profile $PROFILE --bucket $BUCKET --key case-b
```

Expected: first get-object-retention shows COMPLIANCE with a
`RetainUntilDate` ~24h from now (inherited from the bucket rule); after the
extend, the read-back date equals `$RETAIN_B`.

## Block 5 — case C: Glacier storage class, then extend

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
echo "integrity spike case C" > /tmp/spike-c.txt
RETAIN_C1=$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)
echo "initial retain-until: $RETAIN_C1"
aws s3api put-object --profile $PROFILE --bucket $BUCKET --key case-c --body /tmp/spike-c.txt \
    --storage-class GLACIER --object-lock-mode COMPLIANCE --object-lock-retain-until-date $RETAIN_C1
aws s3api head-object --profile $PROFILE --bucket $BUCKET --key case-c \
    --query '{StorageClass:StorageClass,Mode:ObjectLockMode,RetainUntil:ObjectLockRetainUntilDate}'

RETAIN_C2=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)
echo "extended retain-until: $RETAIN_C2"
aws s3api put-object-retention --profile $PROFILE --bucket $BUCKET --key case-c \
    --retention "Mode=COMPLIANCE,RetainUntilDate=$RETAIN_C2"
aws s3api get-object-retention --profile $PROFILE --bucket $BUCKET --key case-c
```

Expected: head-object shows `"StorageClass": "GLACIER"` with the COMPLIANCE
lock; after the extend, the read-back `RetainUntilDate` equals `$RETAIN_C2`.

## Block 6 — cleanup (run ≥ 2 days after block 4, once all retentions expired)

```bash
PROFILE=scw-staging
BUCKET=staging-integrity-lock-spike
aws s3api list-object-versions --profile $PROFILE --bucket $BUCKET \
    --query '{Versions:Versions[].{Key:Key,VersionId:VersionId},DeleteMarkers:DeleteMarkers[].{Key:Key,VersionId:VersionId}}'
# for each Key/VersionId listed above (versions AND delete markers):
#   aws s3api delete-object --profile $PROFILE --bucket $BUCKET --key <Key> --version-id <VersionId>
aws s3api delete-bucket --profile $PROFILE --bucket $BUCKET
```

Expected: version deletions succeed (retentions expired), then delete-bucket
succeeds. If a delete is still refused, its retention has not expired yet —
retry later.

## Results

(filled during the run — raw outputs, verbatim)

- Block 0/1 (setup): _pending_
- Case A (inline lock, extend without/with version-id): _pending_
- Case A′ (shorten + delete refused): _pending_
- Case B (default-retention lock, extend): _pending_
- Case C (Glacier, extend): _pending_
- Cleanup: _pending_

## Verdict

_pending — PASS/FAIL per case, overall conclusion for integrity.md §3.4/§12_
````

- [ ] **Step 2: Commit**

```bash
git add docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md
git commit -m "docs(integrity): runbook for the Scaleway lock-prolongation spike"
```

---

### Task 2: Supervised run — setup and cases A/A′/B/C

**Files:**
- Modify: `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md` (Results section)

**Interfaces:**
- Consumes: runbook blocks 0–5 from Task 1.
- Produces: the filled “Results” section (verbatim outputs) and a per-case PASS/FAIL verdict that Task 3 turns into doc updates.

**Note:** this task is interactive — the agent presents blocks and the user runs them. It cannot be delegated to a subagent.

- [ ] **Step 1: Hand blocks 0–1 to the user, analyze pasted output**

Present runbook blocks 0 and 1 to the user. Check the pasted output against the runbook's Expected notes (bucket created, COMPLIANCE/1-day rule echoed back, versioning Enabled). On any failure, stop and diagnose before continuing (wrong profile/endpoint, bucket name collision, missing object-lock support on the project).

- [ ] **Step 2: Hand block 2 (case A) to the user, analyze**

The core test. PASS requires: both extends return success AND both read-backs show the new `RetainUntilDate` (`$RETAIN_A2`, then `$RETAIN_A3`). Record the raw output under Results → Case A. If the extend errors (the reported bug), capture the exact error code/message verbatim — that message is the key evidence for the FAIL path.

- [ ] **Step 3: Hand block 3 (case A′) to the user, analyze**

PASS requires: **both** commands are refused. Record raw output under Results → Case A′.

- [ ] **Step 4: Hand block 4 (case B) to the user, analyze**

PASS requires: initial retention shows COMPLIANCE ~+24h with no inline lock, and the read-back after extend equals `$RETAIN_B`. Record raw output.

- [ ] **Step 5: Hand block 5 (case C) to the user, analyze**

PASS requires: object is GLACIER class with the compliance lock, and the read-back after extend equals `$RETAIN_C2`. Record raw output. If Scaleway refuses the lock or the extend *specifically on GLACIER*, that is a partial verdict: Option B viable on Standard only — record it as such.

- [ ] **Step 6: Fill the runbook's Results section and commit**

Paste the collected outputs verbatim into the Results section, one sub-heading per case, each ending with `**PASS**` / `**FAIL**` and one sentence of justification. Fill the Verdict section with the overall conclusion.

```bash
git add docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md
git commit -m "docs(integrity): record Scaleway lock-prolongation spike results"
```

---

### Task 3: Record the verdict in the architecture doc

**Files:**
- Modify: `docs/architecture/integrity.md` (§3.4 Option B dependency callout; §10 item 1 next steps; §12 first bullet)
- Modify: `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-design.md` (status line)

**Interfaces:**
- Consumes: per-case PASS/FAIL verdicts from Task 2's Results section.

- [ ] **Step 1: Update integrity.md for the actual verdict**

On **PASS** (all cases):
- §3.4, the `> **Dependency:**` blockquote under Option B: replace its body with a resolved note, e.g. `> **Dependency — resolved 2026-07-XX:** lock prolongation validated on Scaleway (staging, aws-cli spike: inline + default-retention locks, Standard + Glacier classes; see docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md). Option B is confirmed as the primary model; Option A remains a documented fallback for providers without prolongation.`
- §12 first bullet: retitle `**Scaleway "prolong lock" bug — RESOLVED (2026-07-XX).**` and rewrite the body to state the spike validated prolongation on Scaleway (link the runbook), so Option A is no longer a blocking prerequisite.
- §10 item 1: in the "Immediate next steps" sentence, mark the re-anchoring fallback as not needed for Scaleway (validated), keeping it only as a portability note.

On **FAIL** (core case A fails):
- §3.4: state the spike confirmed the bug (date, error message verbatim, link the runbook); Option A (re-anchoring) becomes the primary renewal model pending a Scaleway fix.
- §12 first bullet: retitle `— CONFIRMED (2026-07-XX)` with the evidence, and state the fallback decision.
- §10 item 1: promote "re-anchoring (§3.4 Option A)" from conditional to **required next work**.

On a **partial** verdict (e.g. Glacier-only failure): scope the notes accordingly (Option B viable on Standard; Glacier cold storage needs Option A or a Scaleway fix).

Replace `2026-07-XX` with the actual run date throughout.

- [ ] **Step 2: Update the design doc status line**

In `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-design.md`, change the `> Status:` line to `> Status: spike run 2026-07-XX — <verdict>. Results in [the runbook](2026-07-16-scaleway-lock-prolongation-spike-runbook.md); verdict recorded in integrity.md §3.4/§10/§12.`

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/integrity.md docs/plans/2026-07-16-scaleway-lock-prolongation-spike-design.md
git commit -m "docs(integrity): record Scaleway lock-prolongation verdict in architecture doc"
```

---

### Task 4: Deferred cleanup (≥ 2 days after the run)

**Files:**
- Modify: `docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md` (Results → Cleanup line)

**Interfaces:**
- Consumes: runbook block 6 from Task 1; requires all retentions from Task 2 to have expired (case B's +2 days is the latest).

**Note:** interactive and time-gated — schedule with the user for run-date + 2 days.

- [ ] **Step 1: Hand block 6 to the user, verify the bucket is gone**

Present runbook block 6. Success = all versions and delete markers deleted, then `delete-bucket` succeeds. If a delete is refused, a retention has not expired — note the earliest possible retry time and stop.

- [ ] **Step 2: Record cleanup completion and commit**

Set Results → Cleanup to `done <date>, bucket deleted`.

```bash
git add docs/plans/2026-07-16-scaleway-lock-prolongation-spike-runbook.md
git commit -m "docs(integrity): Scaleway spike cleanup done, bucket deleted"
```
