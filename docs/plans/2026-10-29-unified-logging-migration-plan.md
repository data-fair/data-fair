# Unified Logging Migration Implementation Plan (data-fair)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move data-fair's api to the unified logger of `@data-fair/lib-node@3` / `@data-fair/lib-express@2`: no more `eventsLog`, `internalError` or `console.*` in server code, owner and resource fields on resource lines, and the log context carried into the piscina resource workers.

**Architecture:** `session.middleware()` (lib-express 2) already opens the request context (ip, host, user, actor account). data-fair adds resource context: the dataset/application read middlewares and `processResourceTask` wrap the rest of their work in `withLogContext(resourceLogFields(...))`, and the resource worker pools receive `getLogContext()` in their payload. Audit lines pass their `code` and, explicitly, the resource/owner fields.

**Tech Stack:** TypeScript (node type stripping), express 5, piscina 5, playwright (unit/api projects), eslint (neostandard).

**Spec:** `/home/alban/data-fair/lib/docs/superpowers/specs/2026-10-29-unified-logging-design.md` (lib repo, rollout step 2) and the lib-node README "Logging" section (`node_modules/@data-fair/lib-node/README.md`), which is the up-to-date API reference.

## Global Constraints

- Logger API: `import log from '@data-fair/lib-node/log.js'`; `log.info|warn|alert|error(msg, fields?)`; `code` is a **static string** (never ids, slugs, hosts); errors go in `fields.err`; `error` is for internal failures only, client errors are `warn` at most.
- `debug` call sites (`import debugLib from 'debug'`) stay unchanged.
- Field names (decided with the user): actor account comes from the context (`accountKey`, `accountDep`, `accountName`); the resource owner is `ownerKey` (`type + '.' + id`), `ownerDep`, `ownerName`; the resource is `resourceType` (`'datasets' | 'applications' | 'remote-services'`) and `resourceId`.
- Never use `level`, `time`, `msg`, `hostname` as field names.
- `api/scripts/` (CLI scripts) and `api/upgrade/` keep `console`; everything else in `api/src/` and `api/index.ts` uses `log`.
- Iterate with targeted tests only (AGENTS.md): `npx playwright test <file>`; the dev env is driven with `npx --no df-dev ...`, never started or killed by the agent.
- Commits: conventional commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A route that changes ownership** (`changeDatasetOwner`, application owner change) — the "from" line carries the old owner, the "to" line the new owner, not both the same.
2. **Background tasks with no request** (workers loop, TTL, auto-update) — lines carry resource fields from `processResourceTask`, no user fields, no crash when the context is empty.
3. **Resource workers' non-task exports** (`setEnv`, `setConfig`, `setNock`, `setSireneNock*`, `setCoordsNock`) — called by tests with their own payload shape; they must not be wrapped.
4. **Settings events** — the owner is the settings' account, not a resource: `ownerLogFields` only, no `resourceType`.
5. **Infected file upload** (`clamav.ts`, no `req` in scope today) — the line still carries the actor through the request context.

---

## File Structure

- Create `api/src/misc/utils/log-fields.ts` — `ownerLogFields`, `resourceLogFields` (pure, config-free).
- Create `tests/features/infra/log-fields.unit.spec.ts`.
- Modify `api/src/misc/utils/req-context.ts` — remove `LogContext` and `reqEventLogContext`.
- Modify the services/routes carrying `logCtx` (settings, applications, datasets, fragments) and every `eventsLog` / `internalError` / `console` call site.
- Modify `api/src/datasets/middlewares.ts`, `api/src/applications/middlewares.ts`, `api/src/workers/index.ts`, `api/src/workers/*/index.ts`; create `api/src/workers/log-context.ts`.
- Modify `api/package.json`, `package.json`, `package-lock.json`, `eslint.config.mjs`, architecture docs mentioning the old APIs.

---

### Task 1: Upgrade the libs, port eventsLog and internalError

The lib bump removes `eventsLog` and `internalError`, so the api only runs again once every call site is ported: this task is one commit.

**Files:**
- Modify: `api/package.json` (`@data-fair/lib-node` `^3.0.0`, `@data-fair/lib-express` `^2.0.0`, devDependency `pino-pretty` `^13.2.0`), root `package.json` (`@data-fair/lib-node` `^3.0.0`), `package-lock.json`
- Create: `api/src/misc/utils/log-fields.ts`, `tests/features/infra/log-fields.unit.spec.ts`
- Modify: `api/src/misc/utils/req-context.ts`; every file listed by `grep -rln "eventsLog\|internalError\|logCtx\|LogContext" api/src api/index.ts`

**Interfaces:**
- Produces:
  - `export type OwnerLike = { type: string, id: string, name?: string, department?: string }`
  - `export function ownerLogFields (owner: OwnerLike): { ownerKey: string, ownerDep?: string, ownerName?: string }` — undefined values omitted
  - `export function resourceLogFields (type: ResourceType, resource: { id: string, owner: OwnerLike }): { resourceType: ResourceType, resourceId: string, ownerKey: string, ownerDep?: string, ownerName?: string }`

- [ ] **Step 1: Bump** — edit the three ranges, add `pino-pretty`, run `npm install`. Expected: `node_modules/@data-fair/lib-node/package.json` version `3.0.0`, no nested lib-node copy (`find node_modules -path '*@data-fair/lib-node/package.json' | wc -l` → 1).

- [ ] **Step 2: Write the failing unit test** `tests/features/infra/log-fields.unit.spec.ts` (static import from `'../../../api/src/misc/utils/log-fields.ts'`, like `s3-retry.unit.spec.ts`: the module is config-free):

```ts
test('ownerLogFields describes an organization department', () => {
  assert.deepEqual(ownerLogFields({ type: 'organization', id: 'o1', name: 'Org 1', department: 'dep1' }), { ownerKey: 'organization.o1', ownerDep: 'dep1', ownerName: 'Org 1' })
})
test('ownerLogFields omits missing values', () => {
  assert.deepEqual(ownerLogFields({ type: 'user', id: 'u1' }), { ownerKey: 'user.u1' })
})
test('resourceLogFields adds the resource to the owner fields', () => {
  assert.deepEqual(resourceLogFields('datasets', { id: 'd1', owner: { type: 'user', id: 'u1', name: 'U' } }), { resourceType: 'datasets', resourceId: 'd1', ownerKey: 'user.u1', ownerName: 'U' })
})
```

- [ ] **Step 3: Run** `npx playwright test tests/features/infra/log-fields.unit.spec.ts` — Expected: FAIL (module not found).
- [ ] **Step 4: Implement** `log-fields.ts` (no import of `#config`). Run the test — Expected: PASS.

- [ ] **Step 5: Port the audit events** (`eventsLog.<level>(code, msg, ctx)` → `log.<level>(msg, { code, ...fields })`):
  - the event concerns a resource → `{ code, ...resourceLogFields(type, resource) }` (always explicit, even where the route middleware already set the context);
  - ownership changes: the "from" line `resourceLogFields(type, resource)`, the "to" line `{ ...resourceLogFields(type, resource), ...ownerLogFields(newOwner) }`;
  - settings events (`settings/service.ts`, `settings/middlewares.ts`) → `{ code, ...ownerLogFields(owner) }`;
  - `clamav.ts` infected file → `log.warn(msg, { code: 'df.infected-file' })`;
  - `datasets/es/values-agg.ts` → `log.warn(msg, { code: 'values_agg_combined_size', ...resourceLogFields('datasets', dataset) })`;
  - the dynamic `import('@data-fair/lib-express/events-log.js')` blocks in `datasets/utils/rest.ts` become plain `log.info` calls (static import of `log`).
- [ ] **Step 6: Remove `logCtx`** — drop `LogContext` / `reqEventLogContext` from `req-context.ts`, the `logCtx` member of the service `ctx` types (`settings/service.ts`, `applications/service.ts`, `datasets/service.ts` `changeDatasetOwner`, `fragments/service.ts` `changeFragmentsOwner`) and every `logCtx: reqEventLogContext(req)` at the call sites.
- [ ] **Step 7: Port `internalError`** — `internalError(code, err)` → `log.error(<short phrase naming the failed operation>, { code, err })`; `internalError(code, 'message')` → `log.error('message', { code })`; a message embedding ids keeps them in `msg`, never in `code`. Imports of `internalError` from `@data-fair/lib-node/observer.js` removed.
- [ ] **Step 8: Verify nothing is left** — `grep -rn "eventsLog\|internalError\|events-log\|logCtx\|reqEventLogContext" api/src api/index.ts` → empty. `npm run lint` → no errors. `npm run check-types-ratchet` → passes.
- [ ] **Step 9: Run the affected api tests** — with the dev env running (`npx --no df-dev restart api` after the install, then `npx --no df-dev status` shows api ready): `npx playwright test tests/features/settings tests/features/applications tests/features/datasets/rest*` — Expected: PASS. Then trigger one dataset patch through the UI or an api test and check `npx --no df-dev logs api -n 50` shows a line with `df.datasets.patch`, `resourceId`, `ownerKey`, `userId`.
- [ ] **Step 10: Commit** — `feat!: unified logger from lib-node 3` with a body listing: eventsLog/internalError replaced by log, owner and resource fields, df-event output format change (fluent-bit routes to adapt).

---

### Task 2: Resource log context in routes and workers

**Files:**
- Modify: `api/src/datasets/middlewares.ts` (the read middleware ending with `setReqDataset` / `setReqResource`), `api/src/applications/middlewares.ts` (`readApplication`, `setProxyResource`), `api/src/workers/index.ts` (`processResourceTask`)
- Create: `api/src/workers/log-context.ts`
- Modify: `api/src/workers/short-processor/index.ts`, `files-manager/index.ts`, `files-processor/index.ts`, `batch-processor/index.ts`
- Test: `tests/features/infra/log-fields.unit.spec.ts` (worker helper)

**Interfaces:**
- Consumes: `resourceLogFields` (Task 1), `withLogContext` / `getLogContext` / `LogContext` from `@data-fair/lib-node/log.js`.
- Produces: `export type TaskPayload<R> = { resource: R, logContext: LogContext }` and `export function resourceTask<R, T> (fn: (resource: R) => Promise<T> | T): (payload: TaskPayload<R>) => Promise<T> | T` — runs `fn(payload.resource)` inside `withLogContext(payload.logContext, ...)`.

- [ ] **Step 1: Write the failing unit test** (same spec file):

```ts
test('resourceTask restores the log context of the payload', async () => {
  const task = resourceTask(async (resource: { id: string }) => ({ id: resource.id, ctx: getLogContext() }))
  const result = await task({ resource: { id: 'd1' }, logContext: { resourceId: 'd1', task: 'finalize' } })
  assert.deepEqual(result, { id: 'd1', ctx: { resourceId: 'd1', task: 'finalize' } })
})
```

- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** `log-context.ts`. Run — Expected: PASS.
- [ ] **Step 4: Routes** — in the three read middlewares replace the final `next()` with `withLogContext(resourceLogFields(<type>, resource), next)`.
- [ ] **Step 5: Main side of workers** — wrap the body of `processResourceTask` in `withLogContext({ ...resourceLogFields(type, resource), task: task.name }, async () => { ... })` and call `workers[task.worker].run({ resource, logContext: getLogContext() }, { name: task.name })`.
- [ ] **Step 6: Worker side** — wrap every export of the four worker `index.ts` files that receives the resource (`initialize`, `storeFile`, `analyzeCsv`, `analyzeGeojson`, `normalizeFile`, `extend`, `indexLines`, `validateFile`, `renewApiKey`, `manageTTL`, `autoUpdate`, `errorRetry`, `autoUpdateExtension`, `finalize`, `historize`, `historizeLines`, `computeDatasetSearchIndex`, `computeApplicationSearchIndex`, and any other task name used by `workers/tasks.ts`) with `resourceTask(...)`. Leave `setEnv`, `setConfig`, `setNock`, `setCoordsNock`, `setSireneNock*` untouched. Check every other `.run(` on these four pools (`grep -rn "workers\.\(shortProcessor\|filesManager\|filesProcessor\|batchProcessor\)\|\.run(" api/src tests`) passes the new payload shape when it targets a wrapped export.
- [ ] **Step 7: Run** `npx --no df-dev restart api`, then `npx playwright test tests/features/datasets --grep @smoke` and the dataset file/rest/extension api tests touching the workers — Expected: PASS. Check `npx --no df-dev logs api -n 100` after a file upload: worker lines (e.g. debug disabled, so an info or warn from a task) carry `resourceId` and `task`.
- [ ] **Step 8: Commit** — `feat(logs): resource context in routes and resource workers`

---

### Task 3: Port console.* and forbid it

**Files:**
- Modify: the files listed by `grep -rln "console\.\(log\|warn\|error\|info\|debug\)" api/src api/index.ts` (~48 files, ~98 calls), `eslint.config.mjs`

- [ ] **Step 1: Add the eslint rule** — a block `{ files: ['api/src/**/*.ts', 'api/src/**/*.js', 'api/index.ts'], rules: { 'no-console': 'error' } }`. Run `npm run lint` — Expected: FAIL listing the console calls (this is the failing check of the task).
- [ ] **Step 2: Port** — `console.log` → `log.info`, `console.warn` → `log.warn`, `console.error` → `log.error` with a static code when it reports an internal failure (else `log.warn`), `console.debug` → the module's `debug` instance (create one with `debugLib('<module name>')` if none). Variadic arguments become fields (`{ datasetId, count }`) or an `err` field, not string concatenation of objects. Startup banners in `api/index.ts` become `log.info`.
- [ ] **Step 3: Run** `npm run lint` and `npm run check-types-ratchet` — Expected: PASS. `npx playwright test --project=unit` — Expected: PASS. `npx --no df-dev restart api` then `npx --no df-dev status` — Expected: api ready.
- [ ] **Step 4: Commit** — `chore(logs): port console calls to the logger, forbid console in api code`

---

### Task 4: Docs and rollout notes

**Files:**
- Modify: `docs/architecture/code-conventions.md`, `docs/architecture/notifications.md`, `docs/architecture/catalog-search.md`, `docs/architecture/storage-accounting.md` (every architecture doc that `grep -rln "eventsLog\|internalError\|df-event" docs/architecture` lists), `AGENTS.md` if it mentions them. Plans under `docs/plans/` are history and stay untouched.

- [ ] **Step 1: Update** the conventions: logging through `@data-fair/lib-node/log.js`, `code` rules, `resourceLogFields` / `ownerLogFields` on audit lines, `resourceTask` for resource worker exports, `debug` unchanged. Point to the lib-node README for the full API.
- [ ] **Step 2: Verify** `grep -rn "eventsLog\|internalError\|df-event" docs/architecture AGENTS.md` → empty.
- [ ] **Step 3: Commit** — `docs: logging conventions after the unified logger migration`

Rollout (not code, for the PR description): deploy the branch on staging, adapt the fluent-bit routes to the JSON output (no `df-event:` prefix, events identified by `code`, owner in `ownerKey`), check that `trace_id` appears with the OpenTelemetry operator, then release.
