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

Run 2026-07-16 (~12:20–12:25 UTC), aws-cli/2.32.34, profile `scw-staging`,
endpoint `s3.fr-par.scw.cloud`. Raw outputs, verbatim.

### Block 0/1 (setup) — OK

```
aws-cli/2.32.34 Python/3.13.11 Linux/6.17.0-35-generic exe/x86_64.ubuntu.24
{
    "Location": "/staging-integrity-lock-spike"
}
{
    "ObjectLockConfiguration": {
        "ObjectLockEnabled": "Enabled",
        "Rule": {
            "DefaultRetention": {
                "Mode": "COMPLIANCE",
                "Days": 1
            }
        }
    }
}
{
    "Status": "Enabled"
}
```

### Case A (inline lock, extend without/with version-id) — **PASS**

```
{
    "ETag": "\"2029d88d9eef02c37ffc110b263d956e\"",
    "ChecksumCRC64NVME": "OlTDHeZPb3o=",
    "ChecksumType": "FULL_OBJECT",
    "VersionId": "1784204507848441"
}
{
    "Retention": {
        "Mode": "COMPLIANCE",
        "RetainUntilDate": "2026-07-16T13:21:47+00:00"
    }
}
extended retain-until: 2026-07-16T14:21:53Z
{
    "Retention": {
        "Mode": "COMPLIANCE",
        "RetainUntilDate": "2026-07-16T14:21:53+00:00"
    }
}
version id: 1784204507848441
re-extended retain-until: 2026-07-16T15:21:54Z
{
    "Retention": {
        "Mode": "COMPLIANCE",
        "RetainUntilDate": "2026-07-16T15:21:54+00:00"
    }
}
```

Both extends succeeded and the read-back `RetainUntilDate` equals the
requested date each time — including the no-`--version-id` form that
`IntegrityStore.extendRetention()` uses.

### Case A′ (shorten + delete refused) — **PASS**

```
An error occurred (AccessDenied) when calling the PutObjectRetention operation: Access Denied because object protected by object lock.

An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied because object protected by object lock.
```

Both the shorten attempt and the version delete were refused: the lock is a
real compliance lock, so case A's successful extends are meaningful.

### Case B (default-retention lock, extend) — **PASS**

```
{
    "ETag": "\"86dd0caed73a4fc7bda9bb329eb92ae0\"",
    "ChecksumCRC64NVME": "hxYeySoenao=",
    "ChecksumType": "FULL_OBJECT",
    "VersionId": "1784204659200242"
}
{
    "Retention": {
        "Mode": "COMPLIANCE",
        "RetainUntilDate": "2026-07-17T12:24:19.200000+00:00"
    }
}
extended retain-until: 2026-07-18T12:24:21Z
{
    "Retention": {
        "Mode": "COMPLIANCE",
        "RetainUntilDate": "2026-07-18T12:24:21+00:00"
    }
}
```

The lock inherited from the bucket's `DefaultRetention` rule (no inline lock
on the put) extends just like an inline one.

### Case C (Glacier, extend) — **PASS**

```
{
    "ETag": "\"986d0ef835422ea1d4802a37e64ed653\"",
    "ChecksumCRC64NVME": "AGC3tFmjQsM=",
    "ChecksumType": "FULL_OBJECT",
    "VersionId": "1784204695087103"
}
{
    "StorageClass": "GLACIER",
    "Mode": "COMPLIANCE",
    "RetainUntil": "2026-07-16T13:24:54+00:00"
}
extended retain-until: 2026-07-16T14:24:56Z
{
    "Retention": {
        "Mode": "COMPLIANCE",
        "RetainUntilDate": "2026-07-16T14:24:56+00:00"
    }
}
```

The compliance lock applies and extends on a GLACIER-class object.

### Cleanup — _pending_

Run block 6 after 2026-07-18T12:24:21Z (case B's extended retention, the
latest lock in the bucket).

## Verdict

**PASS on all cases — the reported Scaleway lock-prolongation bug does not
reproduce (2026-07-16, fr-par).** `PutObjectRetention` with
`Mode: COMPLIANCE` and a later `RetainUntilDate` works with and without
`--version-id`, on inline and default-retention locks, on Standard and
Glacier storage classes; shortening and deleting are correctly refused.
Option B (lock renewal by extension, integrity.md §3.4) is validated as the
primary renewal model on the target provider; Option A (re-anchoring)
remains a documented fallback for providers without prolongation.
