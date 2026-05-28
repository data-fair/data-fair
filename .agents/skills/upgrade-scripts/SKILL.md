---
name: upgrade-scripts
description: >
  How to add a database migration / upgrade script in a data-fair service that
  uses @data-fair/lib-node/upgrade-scripts (data-fair, processings, events,
  catalogs, etc.). Covers the gotcha that trips up most agents: which version
  goes in the folder name. Use this skill whenever the user asks to add an
  upgrade script, write a migration, backfill a field on existing documents,
  reshape a Mongo collection on deploy, or anything described as "needs to run
  once on production after deploy". Also use it when reading or modifying an
  existing `upgrade/X.Y.Z/` directory.
---

# Upgrade Scripts in data-fair Services

`@data-fair/lib-node/upgrade-scripts` is the migration runner used by data-fair
services. At service startup it scans the `upgrade/` directory for
version-named subfolders, compares them against the version recorded in the
`services` Mongo collection, and runs the scripts whose folder version is `>=`
the recorded version. After running, it stores the current `package.json`
version back in the `services` collection.

## The one rule about the folder name

**Name the folder after the version of the last release of the service** at
the time you write the script. Never after an anticipated future version.

### Why this is the rule

When you are working on a branch, you do **not** know what version the change
will eventually ship as. The same branch's content can end up in a minor
release, a major release, or be backported to several lines at once. The
forward version is genuinely unknown at authoring time, so the only stable
reference is the last version that has already been released.

The runner uses `semver.gte(folder, dbVersion)`, so the folder name
effectively encodes the claim "this migration applies whenever the database
was previously at this version or older". The last released version is the
correct answer to that claim — it is the most recent state from which a
user's database could still be coming.

### What "expected" behavior looks like

With folder = last-released-version:

- **Production upgrade.** Before the release, prod `package.json` is at the
  last release (= folder name) and the DB matches. When the new release
  deploys, `package.json` bumps past the folder; the runner sees
  `dbVersion = <last-release>`, folder `>= dbVersion` → runs once. After the
  run, DB is updated to the new `package.json`. Subsequent restarts: folder
  `< dbVersion` → never runs again.
- **Staging.** Staging usually runs the development branch with
  `package.json` still at the last release. So folder = pjson = DB, and the
  script **re-runs on every staging deploy** until the next release ships.
  This is expected and is exactly why scripts must be idempotent.

### Finding the last released version

Read it straight from the service's `package.json`. In data-fair services
the version is bumped on release, not at branch start, so on any working
branch the `version` field is exactly the last released version.

```sh
jq -r .version package.json
# → 6.4.2
# → create upgrade/6.4.2/your-script.ts
```

Take the value as it stands; do not invent or anticipate the next bump.

### Multiple scripts in one folder

If several scripts target the same last-released version, put them all in
the same folder — they execute in lexicographic order. Prefix with `01-`,
`02-` if order matters.

## Script structure

Scripts are TypeScript modules with a default export that satisfies the
`UpgradeScript` interface:

```ts
// upgrade/6.4.2/backfill-modified.ts
import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'

const upgradeScript: UpgradeScript = {
  description: 'Backfill _modified field on existing datasets',
  async exec (db, debug) {
    debug('backfilling _modified on datasets without it')
    let count = 0
    const cursor = db.collection('datasets').find({ _modified: { $exists: false } })
    for await (const dataset of cursor) {
      const _modified = dataset.dataUpdatedAt ?? dataset.updatedAt
      if (_modified) {
        await db.collection('datasets').updateOne(
          { _id: dataset._id },
          { $set: { _modified } }
        )
        count++
      }
    }
    debug(`backfilled ${count} datasets`)
  }
}

export default upgradeScript
```

Key points:

- **`description`** is logged at run time; make it a single short sentence in
  the imperative or descriptive mood.
- **`exec(db, debug)`** receives a live `Db` connection from the same Mongo
  client the service uses, and a namespaced `debug` logger
  (`upgrade:<folder>:<filename>`).
- **Must be idempotent.** Use `$exists: false`, `{ field: { $ne: newValue } }`,
  or similar guards. A script that has already done its work must be a no-op,
  not a failure.

## Idempotency patterns

Scripts must be safe to re-run. Re-runs happen on every staging deploy until
the next release ships (see above), and also when two pods start
concurrently, when one crashes mid-loop, or on manual re-runs.

Make the body trivially safe to re-run:

```ts
// ✓ Filter out already-migrated documents
await db.collection('x').updateMany(
  { newField: { $exists: false } },
  { $set: { newField: defaultValue } }
)

// ✓ Use $rename only if source still exists
await db.collection('x').updateMany(
  { oldName: { $exists: true } },
  { $rename: { oldName: 'newName' } }
)

// ✗ Anything that breaks on second run
await db.collection('x').updateMany({}, { $inc: { counter: 1 } })
```

For destructive migrations (dropping a field, deleting documents), pair the
write with a precondition check so a re-run is a no-op.

## Where to wire it in

The runner is normally called once at service startup, before the HTTP server
accepts traffic, alongside the lock manager:

```ts
import upgradeScripts from '@data-fair/lib-node/upgrade-scripts.js'
import locks from '@data-fair/lib-node/locks.js'
import db from './db.js'

await locks.init(db)
await upgradeScripts(db, locks)
```

If your service uses workspaces, the runner reads `name` and `version` from
the parent `package.json` first (`../package.json`), falling back to the
current one. The `name` is the key under which the version is stored in the
`services` collection, so don't rename a service without a manual data
migration.

### Fresh installs

Pass `isFresh` so the runner can skip historical scripts on a brand-new
database:

```ts
await upgradeScripts(db, locks, './', async () => {
  const count = await db.collection('datasets').estimatedDocumentCount()
  return count === 0
})
```

When `isFresh` returns true, no scripts run; the runner just records the
current version. When false, all scripts with folder name `init` run, then
normal semver-gated scripts run as usual.

## Debugging

The runner uses the `debug` package:

```sh
DEBUG=upgrade,upgrade:* npm start
```

You will see:

- the resolved service name and version
- the version found in the database
- each script as it runs, with its description
- per-script logs from inside `exec`

If a script seems to not run, double-check:

1. The folder name parses as semver (`semver.coerce` is **not** used on folder
   names — `1.0` will fail to compare; use `1.0.0`).
2. The folder version is `>=` the DB-stored version (`db.services.findOne({ id: '<service-name>' })`).
3. The script file's `default` export matches the `UpgradeScript` shape.

## Checklist before merging an upgrade script

- [ ] Folder is named after the **last released version** of the service —
      the `version` field of `package.json` on your working branch. Never an
      anticipated future version.
- [ ] `description` is one short sentence.
- [ ] `exec` is idempotent (safe to run twice).
- [ ] No reliance on collection/field names that newer code has removed —
      legacy code may not exist when this script eventually runs in an old
      install upgrading several versions at once.
- [ ] If multiple scripts in the same folder must run in order, prefix the
      filenames with `01-`, `02-`, etc.
- [ ] Tested against a database snapshot of the old shape (or at minimum
      manually walked through with a sample document).
