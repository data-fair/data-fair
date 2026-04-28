# Publication sites — shared with departments

Extend publication sites with a `sharedWithDepartments: string[]` field that grants dept-level admins the ability to publish on an org-root site, as if the site were owned by their department.

## Motivation

Publication sites today are either owned by an organisation root (every dept member sees them but cannot publish unless the site is `staging`) or scoped to a single department (only that department can publish). There is no way to say "this portal is owned by the organisation, but departments X and Y may also publish on it". Every org running a shared editorial portal across a few departments has to either give everyone admin or flag the site `staging` — which drops the permission bar for every contributor, not just the departments that should co-own the publication flow.

The share list closes that gap: an explicit enumeration of departments that behave as co-owners of the site for permission purposes, set by the portal admin (the site's source of truth) and mirrored into data-fair through the existing sync.

## Design decisions

- **Declaration shape.** Explicit list of department IDs, mirroring the existing scalar `department` field. No "all departments" boolean — YAGNI; can be added as a separate flag later.
- **Permission semantics.** A user whose department is in `sharedWithDepartments` is treated, for this site only, as if the site had `department: <their-dept>`. This composes with `staging` cleanly: a shared + staging site lets dept contributors publish; a shared non-staging site lets dept admins publish directly.
- **Visibility.** The full list of publication sites returned by `GET /settings/.../publication-sites` is unchanged — shared sites are already visible to every org member through the existing merge. Each entry is decorated server-side with a boolean `sharedWithThisDepartment` when the requesting user's department is in the share list. UI uses this to show a "Portail partagé" label and to enable the publish switch.
- **Revocation.** Removing a department from the list does not cascade on existing publications and does not relax subsequent permission checks. After revocation, the dept admin can no longer unpublish their own published resources from that site — only an org-root admin can clean up. This is the intended trap: explicit revocation, explicit clean-up.
- **Source of truth.** The share list is edited on the portal, not in data-fair. Data-fair accepts it via the existing sync `POST` and overwrites the stored value on every upsert, same as `title` or `url`.
- **Scope.** Only an org-root site (no `department`) may carry a non-empty share list. Dept-scoped sites ignoring this would be conceptually inconsistent. Validation at both ends (portal + data-fair) refuses such combinations.

## Changes — data-fair side

### Schema

`api/contract/publication-sites.js` gains one optional property on each publication-site entry:

```js
sharedWithDepartments: {
  type: 'array',
  title: 'Départements partagés',
  items: { type: 'string' },
  default: [],
  readOnly: !admin
}
```

Same visibility convention as `title` / `url` / `draftUrl`: visible to everyone, editable only from the super-admin view. In normal operation the portal sync overwrites the value on the next upsert, so any local edit is transient — we do not actively block it.

### Permission logic

`api/src/misc/utils/publication-sites.ts`, in `applyPatch`, extends the two existing department-boundary branches at lines 50 and 74 with one clause:

```ts
const isShared = publicationSiteInfo.sharedWithDepartments?.includes(
  sessionState.account.department
)
if (!sessionState.user.adminMode
    && !publicationSiteInfo.settings?.staging
    && resource.owner.type === 'organization'
    && sessionState.account?.type === 'organization'
    && sessionState.account.id === resource.owner.id
    && !publicationSiteInfo.department
    && sessionState.account.department
    && !isShared) {
  throw httpError(403, '…')
}
```

Mirrored in the unpublish branch so a dept admin who had publish rights while the share was active can still unpublish while the share is active. After revocation `isShared` goes false and the branch again refuses — this is the intended behaviour per the revocation decision above.

The subsequent `writePublicationSites` admin check is unchanged. A dept admin already holds admin perms on resources owned by their dept, so `permissions.can(... 'writePublicationSites', ...)` passes without extra code.

Event `sender` remains `{ department: publicationSiteInfo.department }` (undefined for org-root sites). Notifications route by ownership, not by grant.

### Settings router

`api/src/settings/router.ts`:

- **POST `/publication-sites`** (line 384). Overwrite `sharedWithDepartments` from the request body on every upsert. Do **not** preserve the stored value — the portal is the source of truth.
- **POST `/publication-sites`** (same handler). Defensive validation: if `req.owner.department` is set and the incoming body's `sharedWithDepartments` is non-empty, respond `400`. Independent of portals-side validation.
- **GET `/publication-sites`** (line 363-382). Inside the per-site loop, decorate with a response-only `sharedWithThisDepartment` boolean:

  ```ts
  if (req.owner.department && publicationSite.sharedWithDepartments?.includes(req.owner.department)) {
    publicationSite.sharedWithThisDepartment = true
  }
  ```

  Not stored, not part of the persistable contract. The TypeScript `PublicationSite` type gains it as an optional boolean.

### UI

- `ui/src/components/settings/settings-publication-sites.vue`: no code change. VJSF renders the new field from the updated contract.
- `ui/src/components/dataset/dataset-publication-sites.vue`:
  - `canPublish` (line 223) extends the final clause with `|| site.sharedWithThisDepartment`.
  - The sort predicate (lines 158-172) treats shared sites as equivalent to department-owned sites, so they sit next to the user's own dept sites.
  - A new subtitle row shows "Portail partagé" / "Shared portal" when `site.sharedWithThisDepartment`.
- `ui/src/components/application/application-publication-sites.vue`: the same three edits.

## Changes — portals side (worktree `~/data-fair/portals_feat-portals-shared-with-deps`)

### Schema

`api/types/portal/schema.js` gains a top-level `sharedWithDepartments`, at the same nesting level as `staging` and `ingress`:

```js
sharedWithDepartments: {
  type: 'array',
  title: 'Departments with access',
  items: { type: 'string' },
  default: []
}
```

### Router / service

- New patch path or extension of the existing portal patch to accept `sharedWithDepartments`.
- Authorization: `assertAccountRole(session, portal.owner, 'admin')` — org-root admin of the portal owner. **Not** `assertAdminMode` (that's platform-level and reserved for ingress). Matches the ownership-change gate in `service.ts:39-56`.
- Validation: refuse `400` if `portal.owner.department` is set and the incoming `sharedWithDepartments` is non-empty.
- `getPublicationSite` at `api/src/portals/service.ts:122-139` adds `sharedWithDepartments: portal.sharedWithDepartments || []` to the emitted payload. Default to `[]` so a cleared share list propagates through the sync.

### UI

A new section on the portal admin page (neighbour of the existing ingress / staging controls) exposes a department list editor. Free-text chip input, matching how `department` is handled elsewhere in data-fair and in the portal owner model — a proper dept-picker can come later if simple-directory grows a roster API. The section is hidden when the portal owner has a department.

## Migration and compatibility

- No data migration. `sharedWithDepartments` is optional with default `[]`; every new code path guards on `?.includes(...)`.
- Sync upserts always emit the field (default `[]`), so a freshly-synced portal that never set a share list reliably clears any stale data-fair value.
- Existing `staging` and dept-scoped sites are unaffected — the new clause only fires when `isShared` is true.

## Testing

**Data-fair API** (alongside existing publication-sites suite):

1. Dept admin of a shared dept can PATCH a dataset's `publicationSites` to include an org-root shared site (200). Same operation from a dept admin whose dept is not in the list returns 403 with the existing message.
2. Revoking the share (org-root admin POST with the dept removed) then attempting to unpublish as the previously-shared dept admin returns 403 — locks the "no cascade, no relaxation" behaviour.
3. Validator rejects a dept-scoped publication-site payload carrying a non-empty `sharedWithDepartments` with 400.

**Portals API**:

4. `PATCH /portals/{id}` with `sharedWithDepartments` succeeds for an org-root admin of the portal owner, fails for a dept admin, and fails when the portal owner has a department.

**Data-fair UI (e2e)**:

5. As a dept admin, the publication panel switch is enabled for a shared site and disabled for a non-shared org-root site in the same list; the "Portail partagé" label appears on the shared row.

**Portals UI**:

6. The new share-list editor is visible only when the session is org-root admin of the portal owner and the owner has no department.

## File map

- `api/contract/publication-sites.js` — schema addition.
- `api/src/settings/router.ts` — overwrite semantics, defensive validation, response decoration.
- `api/src/misc/utils/publication-sites.ts` — `isShared` clause in `applyPatch`.
- `ui/src/components/dataset/dataset-publication-sites.vue`, `ui/src/components/application/application-publication-sites.vue` — gate predicate, label, sort.
- `portals/api/types/portal/schema.js` — new portal field.
- `portals/api/src/portals/router.ts` + `service.ts` — write path, authorization, validation, sync mapping.
- `portals/ui/src/pages/portals/[id]/ingress.vue` (or a sibling pane) — editor.
