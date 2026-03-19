# API Refactor: Router/Service/Operations Modularity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the API layer into a router/service/operations pattern for better maintainability, following the data-fair/agents project structure.

**Architecture:** Each module gets up to 3 layers: router (HTTP), service (stateful/DB), operations (stateless pure functions). Phase 1 refactors 3 small modules. Phase 2 promotes misc/ routers to top-level modules.

**Tech Stack:** Node.js, Express, TypeScript, MongoDB

**Spec:** `docs/superpowers/specs/2026-03-19-api-refactor-modularity-design.md`

---

## Phase 1: Small Modules

### Task 1: search-pages — rename utils.ts to operations.ts

**Files:**
- Rename: `api/src/search-pages/utils.ts` → `api/src/search-pages/operations.ts`
- Modify: `api/src/search-pages/router.js:6`
- Modify: `api/src/search-pages/webhook.ts` (check for imports from utils.ts)

- [ ] **Step 1: Check all imports of search-pages/utils.ts**

Run: `grep -r "search-pages/utils" api/src/`

- [ ] **Step 2: Rename the file**

```bash
git mv api/src/search-pages/utils.ts api/src/search-pages/operations.ts
```

- [ ] **Step 3: Update import in router.js**

In `api/src/search-pages/router.js:6`, change:
```js
import { buildPostSearchPage, extractPortalId } from './utils.ts'
```
to:
```js
import { buildPostSearchPage, extractPortalId } from './operations.ts'
```

- [ ] **Step 4: Update any other imports found in step 1**

Check `webhook.ts` — if it imports from `./utils.ts`, update to `./operations.ts`.

- [ ] **Step 5: Verify the build**

Run: `npm run lint`

- [ ] **Step 6: Commit**

```bash
git add -A api/src/search-pages/
git commit -m "refactor(search-pages): rename utils.ts to operations.ts"
```

---

### Task 2: remote-services — split utils.ts into operations.ts and move stateful functions to service.ts

**Files:**
- Rename: `api/src/remote-services/utils.ts` → `api/src/remote-services/operations.ts`
- Modify: `api/src/remote-services/service.ts:3`
- Modify: `api/src/remote-services/router.js:17`
- Modify: `api/src/app.js:269`

The current `utils.ts` contains:
- **Pure (→ operations.ts):** `validateOpenApi`, `initNew`, `computeActions`, `clean`
- **Stateful (→ service.ts):** `syncDataset` (queries mongo), `init` (queries mongo + HTTP), `fixConceptsFilters` (queries vocabulary via settingsUtils)

- [ ] **Step 1: Check all imports of remote-services/utils.ts**

Run: `grep -r "remote-services/utils" api/src/`

Expected hits:
- `api/src/remote-services/service.ts:3` — imports `clean`, `fixConceptsFilters`
- `api/src/remote-services/router.js:17` — imports `clean`, `validateOpenApi`, `initNew`, `computeActions`
- `api/src/app.js:269` — imports `init`
- `api/src/datasets/router.js:46` — imports `syncDataset`
- `api/src/misc/routers/test-env.ts:80,161` — dynamic imports `init`/`initRemoteServices`

- [ ] **Step 2: Rename utils.ts to operations.ts**

```bash
git mv api/src/remote-services/utils.ts api/src/remote-services/operations.ts
```

- [ ] **Step 3: Move stateful functions from operations.ts to service.ts**

Remove `fixConceptsFilters`, `syncDataset`, and `init` from `api/src/remote-services/operations.ts`. Remove their stateful imports (`mongo`, `config`, `settingsUtils`, `debugLib`, `datasetAPIDocs`, `mongoEscape` for syncDataset, `axios`, `internalError`).

Keep in operations.ts only: `validateOpenApi`, `initNew`, `computeActions`, `clean` and their imports (`ajv`, `findUtils`, `prepareMarkdownContent`, `soasLoader`, `Locale`, `SessionState`, `RemoteService`).

- [ ] **Step 4: Add the stateful functions to service.ts**

Add to `api/src/remote-services/service.ts`:
- Import the needed dependencies: `config`, `settingsUtils`, `debugLib`, `datasetAPIDocs`, `mongoEscape`, `axios`, `internalError`, `slug`
- Import `initNew`, `computeActions` from `./operations.ts`
- Add `fixConceptsFilters` function (lines 34-50 from old utils.ts)
- Add `syncDataset` function (lines 52-111 from old utils.ts)
- Add `init` function (lines 114-166 from old utils.ts)

Update existing imports in service.ts from `./utils.ts` to `./operations.ts`:
```ts
import { clean, computeActions, initNew } from './operations.ts'
```

Note: `fixConceptsFilters` is now local to service.ts, no longer imported.

- [ ] **Step 5: Update router.js imports**

In `api/src/remote-services/router.js:17`, change:
```js
import { clean, validateOpenApi, initNew, computeActions } from './utils.ts'
```
to:
```js
import { clean, validateOpenApi, initNew, computeActions } from './operations.ts'
```

- [ ] **Step 6: Update app.js init import**

In `api/src/app.js:269`, change:
```js
(await import('./remote-services/utils.ts')).init(),
```
to:
```js
(await import('./remote-services/service.ts')).init(),
```

- [ ] **Step 7: Update datasets/router.js import**

In `api/src/datasets/router.js:46`, change:
```js
import { syncDataset as syncRemoteService } from '../remote-services/utils.ts'
```
to:
```js
import { syncDataset as syncRemoteService } from '../remote-services/service.ts'
```

- [ ] **Step 8: Update test-env.ts dynamic imports**

In `api/src/misc/routers/test-env.ts:80`, change:
```ts
const { init: initRemoteServices } = await import('../../remote-services/utils.ts')
```
to:
```ts
const { init: initRemoteServices } = await import('../../remote-services/service.ts')
```

Similarly at line 161:
```ts
const { init } = await import('../../remote-services/utils.ts')
```
to:
```ts
const { init } = await import('../../remote-services/service.ts')
```

- [ ] **Step 9: Verify the build**

Run: `npm run lint`

- [ ] **Step 10: Commit**

```bash
git add api/src/remote-services/ api/src/app.js api/src/datasets/router.js api/src/misc/routers/test-env.ts
git commit -m "refactor(remote-services): split utils into operations.ts + service.ts"
```

---

### Task 3: base-applications — extract service.ts and operations.ts from router.ts

**Files:**
- Create: `api/src/base-applications/service.ts`
- Create: `api/src/base-applications/operations.ts`
- Modify: `api/src/base-applications/router.ts`
- Delete: `api/src/base-applications/utils.js`

The current `router.ts` (306L) contains logic that should be extracted:
- **→ operations.ts:** `clean` from utils.js, `prepareQuery` (pure), `getFragmentFetchUrl` (pure)
- **→ service.ts:** `initBaseApp` (HTTP + DB), `failSafeInitBaseApp`, `syncBaseApp` (DB), `removeDeprecated` (DB), `init`

- [ ] **Step 1: Create operations.ts**

Create `api/src/base-applications/operations.ts` with the pure functions:

```typescript
import { marked } from 'marked'
import { prepareThumbnailUrl } from '../misc/utils/thumbnails.js'
import type { BaseApp } from '#types'

export const clean = (publicUrl: string, baseApp: any, thumbnail?: string, html = false) => {
  baseApp.title = baseApp.title || baseApp.meta.title
  baseApp.applicationName = baseApp.applicationName || baseApp.meta['application-name']
  baseApp.version = baseApp.version || baseApp.meta.version || baseApp.url.split('/').slice(-2, -1).pop()
  baseApp.description = baseApp.description || baseApp.meta.description || ''
  if (html) baseApp.description = marked.parse(baseApp.description)
  baseApp.image = baseApp.image || baseApp.url + 'thumbnail.png'
  baseApp.thumbnail = prepareThumbnailUrl(publicUrl + '/api/v1/base-applications/' + encodeURIComponent(baseApp.id) + '/thumbnail', thumbnail)
  return baseApp
}

export const prepareQuery = (query: URLSearchParams) => {
  return [...query.entries()]
    .filter(entry => !['skip', 'size', 'q', 'status', '{context.datasetFilter}', 'owner'].includes(entry[0]) && !entry[0].startsWith('${'))
    .reduce((a, entry) => { a[entry[0]] = entry[1].split(','); return a }, ({} as Record<string, string[]>))
}

export const getFragmentFetchUrl = (fragment: any) => {
  if (!fragment) return null
  if (fragment['x-fromUrl']) return fragment['x-fromUrl']
  if (fragment.layout?.getItems?.url) {
    if (typeof fragment.layout.getItems.url === 'string') return fragment.layout.getItems.url
    return fragment.layout.getItems.url.expr
  }
  return null
}
```

- [ ] **Step 2: Create service.ts**

Create `api/src/base-applications/service.ts` with the stateful functions extracted from router.ts:

```typescript
import config from '#config'
import mongo from '#mongo'
import axios from '../misc/utils/axios.js'
import jsonRefs from 'json-refs'
import i18n from 'i18n'
import Extractor from 'html-extractor'
import { internalError } from '@data-fair/lib-node/observer.js'
import { clean, prepareQuery, getFragmentFetchUrl } from './operations.ts'
import type { BaseApp } from '#types'

const htmlExtractor = new Extractor()

export const init = async () => {
  await removeDeprecated()
  await Promise.all(config.applications.map(app => failSafeInitBaseApp(app)))
}

async function removeDeprecated () {
  const baseApps = await mongo.baseApplications.find({ deprecated: true }).limit(10000).toArray()
  for (const baseApp of baseApps) {
    const nbApps = await mongo.applications.countDocuments({ url: baseApp.url })
    if (nbApps === 0) await mongo.baseApplications.deleteOne({ id: baseApp.id })
  }
}

async function failSafeInitBaseApp (app: any) {
  try {
    await initBaseApp(app)
  } catch (err) {
    internalError('app-init', err)
  }
}

export async function initBaseApp (app: any) {
  if (app.url[app.url.length - 1] !== '/') app.url += '/'
  const html = (await axios.get(app.url + 'index.html')).data
  const data: { meta: Record<string, string> } = await new Promise((resolve, reject) => htmlExtractor.extract(html, (err, data) => err ? reject(err) : resolve(data)))
  const patch: Partial<BaseApp> = {
    meta: data.meta,
    id: (await import('slugify')).default(app.url, { lower: true }),
    updatedAt: new Date().toISOString(),
    ...app
  }

  try {
    const res = (await axios.get(app.url + 'config-schema.json'))
    if (typeof res.data !== 'object') throw new Error('Invalid json')
    const configSchema: any = (await jsonRefs.resolveRefs(res.data, { filter: ['local'] })).resolved

    patch.hasConfigSchema = true

    const datasetsDefinition = (configSchema.properties && configSchema.properties.datasets) || (configSchema.allOf && configSchema.allOf[0].properties && configSchema.allOf[0].properties.datasets)
    let datasetsFetches: { fromUrl: string, properties: Record<string, any> }[] = []
    if (datasetsDefinition) {
      if (datasetsDefinition.items && getFragmentFetchUrl(datasetsDefinition)) datasetsFetches = [{ fromUrl: getFragmentFetchUrl(datasetsDefinition)!, properties: datasetsDefinition.items.properties }]
      if (getFragmentFetchUrl(datasetsDefinition.items)) datasetsFetches = [{ fromUrl: getFragmentFetchUrl(datasetsDefinition.items)!, properties: datasetsDefinition.items.properties }]
      if (Array.isArray(datasetsDefinition.items)) datasetsFetches = datasetsDefinition.items.filter(item => getFragmentFetchUrl(item)).map(item => ({ fromUrl: getFragmentFetchUrl(item)!, properties: item.properties }))
    }
    const datasetsFilters: any[] = []
    for (const datasetFetch of datasetsFetches) {
      const info = prepareQuery(new URL(datasetFetch.fromUrl, config.publicUrl).searchParams) as Record<string, any>
      info.fromUrl = datasetFetch.fromUrl
      if (datasetFetch.properties) info.properties = datasetFetch.properties
      datasetsFilters.push(info)
    }
    patch.datasetsFilters = datasetsFilters
  } catch (err) {
    patch.hasConfigSchema = false
    internalError('app-config-schema', err)
  }

  if (!patch.hasConfigSchema && !(patch.meta && patch.meta['application-name'])) {
    throw new Error(i18n.__({ phrase: 'errors.noAppAtUrl', locale: config.i18n.defaultLocale }, { url: app.url }))
  }

  patch.datasetsFilters = patch.datasetsFilters || []

  const storedBaseApp = await mongo.baseApplications
    .findOneAndUpdate({ id: patch.id }, { $set: patch }, { upsert: true, returnDocument: 'after' })
  clean(config.publicUrl, storedBaseApp)
  return storedBaseApp as BaseApp
}

export async function syncBaseApp (baseApp: BaseApp) {
  const baseAppReference = { id: baseApp.id, url: baseApp.url, meta: baseApp.meta, datasetsFilters: baseApp.datasetsFilters }
  await mongo.applications.updateMany({ url: baseApp.url }, { $set: { baseApp: baseAppReference } })
  await mongo.applications.updateMany({ urlDraft: baseApp.url }, { $set: { baseAppDraft: baseAppReference } })
}
```

- [ ] **Step 3: Slim down router.ts**

Update `api/src/base-applications/router.ts`:
- Remove `init`, `removeDeprecated`, `failSafeInitBaseApp`, `initBaseApp`, `syncBaseApp`, `prepareQuery`, `getFragmentFetchUrl`
- Remove unused imports: `axios`, `jsonRefs`, `Extractor`, `i18n`, `i18nUtils`, `internalError` (keep only those still used)
- Replace `import * as baseAppsUtils from './utils.js'` with `import { clean } from './operations.ts'`
- Add `import { initBaseApp, syncBaseApp, init } from './service.ts'`
- Keep `export { init }` re-export (app.js imports it from router.ts)
- Update `baseAppsUtils.clean(...)` calls to `clean(...)`

- [ ] **Step 4: Delete utils.js**

```bash
git rm api/src/base-applications/utils.js
```

- [ ] **Step 5: Update admin.js import**

In `api/src/misc/routers/admin.js:6`, change:
```js
import * as baseAppsUtils from '../../base-applications/utils.js'
```
to:
```js
import { clean as cleanBaseApp } from '../../base-applications/operations.ts'
```

Update usage at line 196: `baseAppsUtils.clean(...)` → `cleanBaseApp(...)`

- [ ] **Step 5b: Update applications/router.js import**

In `api/src/applications/router.js:13`, change:
```js
import * as baseAppsUtils from '../base-applications/utils.js'
```
to:
```js
import { clean as cleanBaseApp } from '../base-applications/operations.ts'
```

Update all `baseAppsUtils.clean(...)` calls to `cleanBaseApp(...)`.

- [ ] **Step 6: Verify the build**

Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add api/src/base-applications/ api/src/misc/routers/admin.js
git commit -m "refactor(base-applications): extract service.ts and operations.ts from router"
```

---

## Phase 2: Misc Breakup

### Task 4: limits — split into top-level module

**Files:**
- Create: `api/src/limits/router.ts`
- Create: `api/src/limits/service.ts`
- Delete: `api/src/misc/utils/limits.ts`
- Modify: `api/src/app.js:42,153`
- Modify: `api/src/misc/routers/stats.ts:3`
- Modify: `api/src/misc/utils/metadata-attachments.ts:9`
- Modify: `api/src/datasets/router.js:35`
- Modify: `api/src/datasets/utils/storage.ts:6`

- [ ] **Step 1: Create the limits directory**

```bash
mkdir -p api/src/limits
```

- [ ] **Step 2: Create service.ts**

Create `api/src/limits/service.ts` with the non-router exports from `misc/utils/limits.ts`:

```typescript
import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import type { Account, AccountKeys } from '@data-fair/lib-express'
import type { Limit, Limits } from '#types'

export const getLimits = async (consumer: Account | AccountKeys) => {
  const now = moment()
  let limits = await mongo.limits.findOne<Limits>({ type: consumer.type, id: consumer.id }, { projection: { _id: 0 } })
  if (!limits) {
    limits = {
      type: consumer.type,
      id: consumer.id,
      name: (consumer as Account).name || consumer.id,
      lastUpdate: now.toISOString(),
      defaults: true
    }
    try {
      await mongo.limits.insertOne(limits)
    } catch (err: any) {
      if (err.code !== 11000) throw err
    }
  }
  limits.store_bytes = limits.store_bytes || { consumption: 0 }
  if (limits.store_bytes.limit === null || limits.store_bytes.limit === undefined) limits.store_bytes.limit = config.defaultLimits.totalStorage
  limits.indexed_bytes = limits.indexed_bytes || { consumption: 0 }
  if (limits.indexed_bytes.limit === null || limits.indexed_bytes.limit === undefined) limits.indexed_bytes.limit = config.defaultLimits.totalIndexed
  limits.nb_datasets = limits.nb_datasets || { consumption: 0 }
  if (limits.nb_datasets.limit === null || limits.nb_datasets.limit === undefined) limits.nb_datasets.limit = config.defaultLimits.nbDatasets
  return limits
}

const calculateRemainingLimit = (limits: Limits, key: keyof Limits) => {
  const limit = (limits?.[key] as Limit)?.limit
  if (limit === -1 || limit === null || limit === undefined) return -1
  const consumption = (limits?.[key] && (limits[key] as Limit).consumption) || 0
  return Math.max(0, limit - consumption)
}

export const remaining = async (consumer: AccountKeys) => {
  const limits = await getLimits(consumer)
  return {
    storage: calculateRemainingLimit(limits, 'store_bytes'),
    indexed: calculateRemainingLimit(limits, 'indexed_bytes'),
    nbDatasets: calculateRemainingLimit(limits, 'nb_datasets')
  }
}

export const incrementConsumption = async (consumer: AccountKeys, type: keyof Limits, inc: number) => {
  return await mongo.limits
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $inc: { [`${type}.consumption`]: inc } }, { returnDocument: 'after', upsert: true })
}

export const setConsumption = async (consumer: AccountKeys, type: keyof Limits, value: number) => {
  return await mongo.limits
    .findOneAndUpdate({ type: consumer.type, id: consumer.id }, { $set: { [`${type}.consumption`]: value } }, { returnDocument: 'after', upsert: true })
}
```

- [ ] **Step 3: Create router.ts**

Create `api/src/limits/router.ts` with the router part from `misc/utils/limits.ts`:

```typescript
import express from 'express'
import config from '#config'
import mongo from '#mongo'
import * as ajv from '../misc/utils/ajv.ts'
import { reqAdminMode, reqUserAuthenticated } from '@data-fair/lib-express'
import { getLimits } from './service.ts'
import type { Limits, Request } from '#types'
import type { Response, NextFunction, RequestHandler } from 'express'
import type { Filter } from 'mongodb'

const limitTypeSchema = { type: 'object', properties: { limit: { type: 'number' }, consumption: { type: 'number' } } }
const schema = {
  type: 'object',
  required: ['id', 'type', 'lastUpdate'],
  properties: {
    type: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    lastUpdate: { type: 'string', format: 'date-time' },
    defaults: { type: 'boolean', title: 'these limits were defined using default values only, not specifically defined' },
    store_bytes: limitTypeSchema,
    indexed_bytes: limitTypeSchema,
    nb_datasets: limitTypeSchema,
    hide_brand: limitTypeSchema
  }
}
const validate = ajv.compile(schema)

const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.key === config.secretKeys.limits) return next()
  reqAdminMode(req)
  next()
}

const isAccountMember = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.key === config.secretKeys.limits) return next()
  const user = reqUserAuthenticated(req)
  if (user.adminMode) return next()
  if (!['organization', 'user'].includes(req.params.type)) {
    return res.status(400).type('text/plain').send('Wrong consumer type')
  }
  if (req.params.type === 'user') {
    if (user.id !== req.params.id) {
      return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
    }
  }
  if (req.params.type === 'organization') {
    const org = user.organizations.find(o => o.id === req.params.id)
    if (!org) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  }
  next()
}

export const router = express.Router()

router.post('/:type/:id', isSuperAdmin as RequestHandler, async (req, res, next) => {
  const db = mongo.db
  req.body.type = req.params.type
  req.body.id = req.params.id
  validate(req.body)
  const existingLimits = await db.collection('limits').findOne({ type: req.params.type, id: req.params.id })
  if (existingLimits) {
    for (const key of ['store_bytes', 'indexed_bytes', 'nb_datasets']) {
      if (req.body[key] && existingLimits[key]?.consumption) req.body[key].consumption = existingLimits[key].consumption
    }
  }
  await db.collection('limits')
    .replaceOne({ type: req.params.type, id: req.params.id }, req.body, { upsert: true })
  res.send(req.body)
})

router.get('/:type/:id', isAccountMember as RequestHandler, async (req, res, next) => {
  const limits = await getLimits({ type: req.params.type as 'user' | 'organization', id: req.params.id })
  if (!limits) {
    res.status(404).send()
    return
  }
  res.send(limits)
})

router.get('/', isSuperAdmin as RequestHandler, async (req, res, next) => {
  const filter: Filter<Limits> = {}
  if (req.query.type) filter.type = req.query.type
  if (req.query.id) filter.id = req.query.id
  const results = await mongo.limits
    .find(filter)
    .sort({ lastUpdate: -1 })
    .project({ _id: 0 })
    .limit(10000)
    .toArray()
  res.send({ results, count: results.length })
})
```

- [ ] **Step 4: Delete old file**

```bash
git rm api/src/misc/utils/limits.ts
```

- [ ] **Step 5: Update all consumer imports**

Update these files to import from the new location:

**`api/src/app.js:42`** — change:
```js
const limits = await import('./misc/utils/limits.ts')
```
to:
```js
const limits = await import('./limits/router.ts')
```

**`api/src/app.js:153`** — already uses `limits.router`, no change needed since the variable is reassigned above.

**`api/src/misc/routers/stats.ts:3`** — change:
```ts
import * as limitsUtils from '../utils/limits.ts'
```
to:
```ts
import * as limitsUtils from '../../limits/service.ts'
```

**`api/src/misc/utils/metadata-attachments.ts:9`** — change:
```ts
import * as limits from './limits.ts'
```
to:
```ts
import * as limits from '../../limits/service.ts'
```

**`api/src/datasets/router.js:35`** — change:
```js
import * as limits from '../misc/utils/limits.ts'
```
to:
```js
import * as limits from '../limits/service.ts'
```

**`api/src/datasets/utils/storage.ts:6`** — change:
```ts
import * as limits from '../../misc/utils/limits.ts'
```
to:
```ts
import * as limits from '../../limits/service.ts'
```

- [ ] **Step 6: Verify the build**

Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add api/src/limits/ api/src/app.js api/src/misc/routers/stats.ts api/src/misc/utils/metadata-attachments.ts api/src/datasets/router.js api/src/datasets/utils/storage.ts
git rm api/src/misc/utils/limits.ts
git commit -m "refactor(limits): promote to top-level module with router/service split"
```

---

### Task 5: activity — move to top-level module

**Files:**
- Create: `api/src/activity/router.js` (move from `api/src/misc/routers/activity.js`)
- Modify: `api/src/app.js:152`

- [ ] **Step 1: Move the file**

```bash
mkdir -p api/src/activity
git mv api/src/misc/routers/activity.js api/src/activity/router.js
```

- [ ] **Step 2: Update imports in the moved file**

In `api/src/activity/router.js`, change:
```js
import * as findUtils from '../utils/find.js'
import mongo from '#mongo'
```
to:
```js
import * as findUtils from '../misc/utils/find.js'
import mongo from '#mongo'
```

- [ ] **Step 3: Update app.js mount**

In `api/src/app.js:152`, change:
```js
app.use('/api/v1/activity', (await import('./misc/routers/activity.js')).default)
```
to:
```js
app.use('/api/v1/activity', (await import('./activity/router.js')).default)
```

- [ ] **Step 4: Verify the build**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add api/src/activity/ api/src/app.js
git commit -m "refactor(activity): promote to top-level module"
```

---

### Task 6: stats — move to top-level module

**Files:**
- Create: `api/src/stats/router.ts` (move from `api/src/misc/routers/stats.ts`)
- Modify: `api/src/app.js:148`

- [ ] **Step 1: Move the file**

```bash
mkdir -p api/src/stats
git mv api/src/misc/routers/stats.ts api/src/stats/router.ts
```

- [ ] **Step 2: Update imports in the moved file**

In `api/src/stats/router.ts`, change:
```ts
import * as cacheHeaders from '../utils/cache-headers.js'
import * as limitsUtils from '../../limits/service.ts'
```
to:
```ts
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import * as limitsUtils from '../limits/service.ts'
```

(Note: limitsUtils path depends on Task 4 being done first.)

- [ ] **Step 3: Update app.js mount**

In `api/src/app.js:148`, change:
```js
app.use('/api/v1/stats', apiKey('stats'), (await import('./misc/routers/stats.ts')).default)
```
to:
```js
app.use('/api/v1/stats', apiKey('stats'), (await import('./stats/router.ts')).default)
```

- [ ] **Step 4: Verify the build**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add api/src/stats/ api/src/app.js
git commit -m "refactor(stats): promote to top-level module"
```

---

### Task 7: catalog — move to top-level module

**Files:**
- Create: `api/src/catalog/router.js` (move from `api/src/misc/routers/catalog.js`)
- Modify: `api/src/app.js:143`

- [ ] **Step 1: Move the file**

```bash
mkdir -p api/src/catalog
git mv api/src/misc/routers/catalog.js api/src/catalog/router.js
```

- [ ] **Step 2: Update imports in the moved file**

In `api/src/catalog/router.js`, update relative paths:
```js
import * as findUtils from '../utils/find.js'
→ import * as findUtils from '../misc/utils/find.js'

import * as datasetUtils from '../../datasets/utils/index.js'
→ import * as datasetUtils from '../datasets/utils/index.js'

import * as permissions from '../../misc/utils/permissions.ts'
→ import * as permissions from '../misc/utils/permissions.ts'

import catalogApiDocs from '../../../contract/site-catalog-api-docs.js'
→ import catalogApiDocs from '../../contract/site-catalog-api-docs.js'

import dcatContext from '../utils/dcat/context.js'
→ import dcatContext from '../misc/utils/dcat/context.js'
```

- [ ] **Step 3: Update app.js mount**

In `api/src/app.js:143`, change:
```js
app.use('/api/v1/catalog', apiKey(['datasets', 'datasets-read']), (await import('./misc/routers/catalog.js')).default)
```
to:
```js
app.use('/api/v1/catalog', apiKey(['datasets', 'datasets-read']), (await import('./catalog/router.js')).default)
```

- [ ] **Step 4: Verify the build**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add api/src/catalog/ api/src/app.js
git commit -m "refactor(catalog): promote to top-level module"
```

---

### Task 8: admin — move to top-level module with service

**Files:**
- Create: `api/src/admin/router.js` (move from `api/src/misc/routers/admin.js`)
- Create: `api/src/admin/service.ts` (absorb health checks from `api/src/misc/routers/status.js`)
- Modify: `api/src/misc/routers/status.js` → keep only `ping` export
- Modify: `api/src/app.js:150`

- [ ] **Step 1: Move admin router**

```bash
mkdir -p api/src/admin
git mv api/src/misc/routers/admin.js api/src/admin/router.js
```

- [ ] **Step 2: Create admin/service.ts**

Create `api/src/admin/service.ts` by extracting `getStatus` and the individual check functions from `status.js`:

```typescript
import config from '#config'
import mongo from '#mongo'
import moment from 'moment'
import axios from '../misc/utils/axios.js'
import fs from 'fs-extra'
import * as clamav from '../misc/utils/clamav.ts'
import filesStorage from '#files-storage'
import debugModule from 'debug'

const debug = debugModule('status')

async function mongoStatus (req: any) {
  debug('mongoStatus ?')
  await mongo.db.command({ ping: 1 })
  debug('mongoStatus ok')
}

async function esStatus (req: any) {
  debug('esStatus ?')
  const es = req.app.get('es')
  const health = await es.cluster.health()
  const healthStatus = health?.status
  if (healthStatus === 'green') {
    // OK
  } else if (config.elasticsearch.acceptYellowStatus && healthStatus === 'yellow') {
    // OK
  } else {
    throw new Error('Health status is ' + healthStatus)
  }
  debug('esStatus ok')
}

async function jwksStatus (req: any) {
  debug('jwksStatus ?')
  const jwksRes = (await axios.get((config.privateDirectoryUrl || config.directoryUrl) + '/.well-known/jwks.json')).data
  if (!jwksRes || !jwksRes.keys || !jwksRes.keys.length) throw new Error('Incomplete JWKS response')
  debug('jwksStatus ok')
}

async function nuxtStatus (req: any) {
  debug('nuxtStatus ?')
  if (process.env.NODE_ENV === 'development') return
  const nuxtConfig = (await import('@data-fair/data-fair-ui/nuxt.config.js')).default
  const dir = nuxtConfig.buildDir || '.nuxt'
  await fs.writeFile(`${dir}/check-access.txt`, 'ok')
  if (req.app.get('nuxt')) await req.app.get('nuxt').renderRoute('/')
  debug('nuxtStatus ok')
}

async function dataDirStatus (req: any) {
  debug('dataDirStatus ?')
  await filesStorage.checkAccess()
  debug('dataDirStatus ok')
}

async function singleStatus (req: any, fn: Function, name: string) {
  const time = moment()
  try {
    await fn(req)
    return { status: 'ok', name, timeInMs: moment().diff(time) }
  } catch (err: any) {
    return { status: 'error', message: err.toString(), name, timeInMs: moment().diff(time) }
  }
}

export async function getStatus (req: any) {
  const promises = [
    singleStatus(req, mongoStatus, 'mongodb'),
    singleStatus(req, esStatus, 'elasticsearch'),
    singleStatus(req, jwksStatus, 'auth-directory'),
    singleStatus(req, dataDirStatus, 'data-dir')
  ]
  if (!config.proxyNuxt) {
    promises.push(singleStatus(req, nuxtStatus, 'nuxt'))
  }
  if (config.clamav.active) {
    promises.push(singleStatus(req, clamav.ping, 'clamav'))
  }
  const results = await Promise.all(promises)

  const errors = results.filter(r => r.status === 'error')
  if (errors.length) console.error('status has errors', errors)
  return {
    status: errors.length ? 'error' : 'ok',
    message: errors.length ? ('Problem with : ' + errors.map(s => s.name).join(', ')) : 'Service is ok',
    details: results
  }
}
```

- [ ] **Step 3: Update status.js to keep only ping**

Replace `api/src/misc/routers/status.js` with:

```javascript
import { getStatus } from '../../admin/service.ts'

export const status = async (req, res, next) => {
  const result = await getStatus(req)
  res.send(result)
}

export const ping = async (req, res, next) => {
  const result = await getStatus(req)
  if (result.status === 'error') res.status(500)
  res.send(result.status)
}
```

- [ ] **Step 4: Update admin/router.js imports**

In `api/src/admin/router.js`, update:
```js
import * as status from './status.js'
→ import { getStatus } from './service.ts'

import * as findUtils from '../utils/find.js'
→ import * as findUtils from '../misc/utils/find.js'

import * as baseAppsUtils from '../../base-applications/utils.js'
→ import { clean as cleanBaseApp } from '../base-applications/operations.ts'

import * as cacheHeaders from '../utils/cache-headers.js'
→ import * as cacheHeaders from '../misc/utils/cache-headers.js'
```

Update status call at line 31:
```js
status.status(req, res, next)
→ const result = await getStatus(req); res.send(result)
```

Update `baseAppsUtils.clean(...)` at line 196 to `cleanBaseApp(...)`.

- [ ] **Step 5: Update app.js mount**

In `api/src/app.js:150`, change:
```js
app.use('/api/v1/admin', (await import('./misc/routers/admin.js')).default)
```
to:
```js
app.use('/api/v1/admin', (await import('./admin/router.js')).default)
```

- [ ] **Step 6: Verify the build**

Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add api/src/admin/ api/src/misc/routers/status.js api/src/app.js
git commit -m "refactor(admin): promote to top-level module with service layer"
```

---

### Task 9: identities — move to top-level module

**Files:**
- Create: `api/src/identities/router.js` (move from `api/src/misc/routers/identities.js`)
- Modify: `api/src/app.js:151`

- [ ] **Step 1: Move the file**

```bash
mkdir -p api/src/identities
git mv api/src/misc/routers/identities.js api/src/identities/router.js
```

- [ ] **Step 2: Update imports in the moved file**

In `api/src/identities/router.js`, update:
```js
import * as datasetsService from '../../datasets/service.js'
→ import * as datasetsService from '../datasets/service.js'

import { ownerDir } from '../../datasets/utils/files.ts'
→ import { ownerDir } from '../datasets/utils/files.ts'
```

- [ ] **Step 3: Update app.js mount**

In `api/src/app.js:151`, change:
```js
app.use('/api/v1/identities', (await import('./misc/routers/identities.js')).default)
```
to:
```js
app.use('/api/v1/identities', (await import('./identities/router.js')).default)
```

- [ ] **Step 4: Verify the build**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add api/src/identities/ api/src/app.js
git commit -m "refactor(identities): promote to top-level module"
```

---

### Task 10: settings — move to top-level module

**Files:**
- Create: `api/src/settings/router.ts` (move from `api/src/misc/routers/settings.ts`)
- Modify: `api/src/app.js:149`
- Modify: `api/src/misc/utils/api-key.ts` (imports type guards from settings router)

- [ ] **Step 1: Check all imports of misc/routers/settings.ts**

Run: `grep -r "misc/routers/settings" api/src/`

- [ ] **Step 2: Move the file**

```bash
mkdir -p api/src/settings
git mv api/src/misc/routers/settings.ts api/src/settings/router.ts
```

- [ ] **Step 3: Update imports in the moved file**

In `api/src/settings/router.ts`, update:
```ts
import nanoid from '../utils/nanoid.js'
→ import nanoid from '../misc/utils/nanoid.js'

import * as permissions from '../utils/permissions.ts'
→ import * as permissions from '../misc/utils/permissions.ts'

import * as cacheHeaders from '../utils/cache-headers.js'
→ import * as cacheHeaders from '../misc/utils/cache-headers.js'

import * as topicsUtils from '../utils/topics.ts'
→ import * as topicsUtils from '../misc/utils/topics.ts'

import * as notifications from '../utils/notifications.ts'
→ import * as notifications from '../misc/utils/notifications.ts'

import standardLicenses from '../../../contract/licenses.js'
→ import standardLicenses from '../../contract/licenses.js'
```

- [ ] **Step 4: Update app.js mount**

In `api/src/app.js:149`, change:
```js
app.use('/api/v1/settings', (await import('./misc/routers/settings.ts')).default)
```
to:
```js
app.use('/api/v1/settings', (await import('./settings/router.ts')).default)
```

- [ ] **Step 5: Update api-key.ts imports**

In `api/src/misc/utils/api-key.ts`, update the import path for type guards (`isUserSettings`, `isDepartmentSettings`) from the old settings router path to the new one.

Run: `grep -n "misc/routers/settings" api/src/misc/utils/api-key.ts`

Update the import to:
```ts
import { isUserSettings, isDepartmentSettings } from '../../settings/router.ts'
```

- [ ] **Step 6: Update any other imports found in step 1**

- [ ] **Step 7: Verify the build**

Run: `npm run lint`

- [ ] **Step 8: Commit**

```bash
git add api/src/settings/ api/src/app.js api/src/misc/utils/api-key.ts
git commit -m "refactor(settings): promote to top-level module"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full lint**

```bash
npm run lint
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

- [ ] **Step 3: Verify no stale imports**

```bash
grep -r "misc/routers/settings\|misc/routers/admin\|misc/routers/activity\|misc/routers/stats\|misc/routers/catalog\|misc/routers/identities\|misc/utils/limits\|remote-services/utils\|base-applications/utils" api/src/ --include='*.ts' --include='*.js'
```

Only `misc/routers/root.ts` and `misc/routers/test-env.ts` should remain referencing misc/routers/. `status.js` should reference `admin/service.ts`.

- [ ] **Step 4: Commit any final fixes**

---

## Deferred Work

The following spec items are deferred to a follow-up iteration. This plan focuses on structural moves and the router/service/operations split where the code clearly separates. Further service/operations extraction for these modules can be done incrementally:

- **settings** — service extraction (API key management, topics propagation, vocabulary logic from the 437-line router)
- **identities** — service extraction (bulk update/delete, GDPR report generation)
- **catalog** — operations extraction (DCAT transformation)
