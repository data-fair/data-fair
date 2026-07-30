# Integrity — next actions (pre-design notes)

> Status: **assessed, not designed**. Three follow-up actions discussed 2026-07-22 at the close
> of the feat-integrity6 iteration, to be executed **one per dedicated branch**, each with its
> own design doc → plan → build cycle (repo protocol). Recommended order: A1 → A2 → A3 (A3 can
> run in parallel with anything). Read `docs/architecture/integrity.md` and
> `api/src/integrity/README.md` (invariants) before starting any of them.

## A1 — Elasticsearch index consistency verification

**Why it is the priority.** Users read datasets through ES (`/lines`), not through the sources
the integrity module verifies. The architecture's "ES is a rebuildable projection" argument
justifies not *historizing* it — it never justified not *verifying* it. Today a direct ES write
serves tampered data to every reader while all verdicts stay green: **the presented data is not
covered by the guarantee.** Until built, this is stated as an explicit limit in
`docs/presentation-integrite-fr/04-perimetre.md` and architecture §12 — remove those honesty
lines when delivering.

**Shape (assessed).** Not historization: a **projection-consistency check** joining what users
can read against the source of truth, surfaced as a third breach member (`breach: ['index']`)
in the existing verdict/alert/realert machinery. Repair = the existing reindex → level 2 is
free.

- REST datasets: exhaustive batch compare Mongo lines → ES docs, joined on the business `_id`
  (NOT the throwaway nanoid ES `_id` — verify a stable join key exists in the index, else add
  one at index time). Compare the **full projected doc** (extension columns included — this is
  pure consistency vs current Mongo, none of the covered-body subtleties apply). Cost ≈ the
  existing nightly Mongo line scan, gate-bounded.
- File datasets: full re-derivation ≈ a reindex read pass — too costly nightly. Count + sampled
  ranges nightly; exhaustive on demand (reuse the `?deep=true` pattern).
- **Verify through the alias** (the path users actually read), never the physical index — a
  diverted alias pointing at a doctored index is an in-scope attack.
- Pending-indexing states (`_needsIndexing`, `_partialRestStatus`) → `unknown` downgrade, same
  posture as everything else; the check-stale alert already bounds accumulated unknowns.
- **No silent auto-repair**: persist a sample of divergent docs in the verdict BEFORE any
  reindex — the reindex destroys the evidence of what was served.

**Open questions.** Sampling policy for file datasets (rate, seed); whether `checked/diverged/
sample` mirrors the lines verdict shape (recommended: yes); whether reindex-as-remedy gets a
one-click admin action in the panel or reuses the existing superadmin reindex.

## A2 — API-key attribution + API-key-only write lock (partial level 3)

**Two stacked ideas.**

1. **`keyRef` in the revision context**: store the API key's **opaque id** (never its title —
   often nominative) when a write was key-authenticated. GDPR posture is the existing
   trail/journal split: the WORM ref is non-identifying, resolution lives in mutable storage
   and dies with the key. Additive optional field on `RevisionContext` → no migration concern
   even post-release. Include the processings admin key (`~/data-fair/processings` writes
   through data-fair with an admin API key — find its exact auth path when designing).
2. **Dataset write-lock `apiKey-only`**: a per-dataset setting refusing any mutation not
   authenticated by an API key. Honest framing: this does NOT extend the threat model (a
   DB-level attacker bypasses the API) — it is **process discipline**: no accidental UI edits,
   every legitimate write attributed to a revocable credential. Combined with keyRef, the
   first-write-lie limit narrows from "the trail proves *that* and *when*, not *who*" to
   "…and *which key*" for everything except the advanced raw-Mongo attacker; trail↔journal
   cross-checking becomes near-mechanical.

**Leanings from the discussion (to confirm at design time).** Lock covers lines AND metadata
(coherence); internal pipeline writes (finalize, extenders, TTL) stay allowed — they are
consequences of already-authorized writes; unlock stays superadmin (a dataset frozen because
all its keys were revoked is the feature, not a bug); enforcement lives in the permission
layer, not scattered in routes. UI: a clear panel toggle + explanatory copy.

**Touchpoints.** `RevisionContext`/`RevisionOrigin` types (api/types/dataset), relay context
plumbing, permission middlewares, the classification of any new dataset field (the ratchet
test will force the decision), presentation doc §garanties (the attribution row of the
adversary table improves).

## A3 — Visual diff of revisions

Pure read-side/UI, no guarantee impact, parallelizable. Current state: the diff dialogs
(`dataset-integrity.vue`) render changed keys as two side-by-side `<pre>` JSON blocks, always
against the *current* state.

- **V1 (cheap, high audit value):** word-level colorized diff for metadata and line bodies
  (jsondiffpatch or equivalent — mind the self-contained/no-CDN constraints of the UI build),
  plus **revision↔revision** pair selection (not only vs current).
- **File payload diff (the hard part):** size cap above which fall back to summary + download
  of both payloads; under the cap, a tabular per-primary-key row diff is reachable. Defer
  freely.
- Screenshots of the client presentation (`dev/capture-integrity-screenshots.ts`) will need
  regeneration if the panel changes.
