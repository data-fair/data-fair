# Permissions Editing Feature Parity Design

**Date:** 2026-03-24
**Goal:** Achieve strict feature parity between legacy and new UI for permissions editing on dataset and application pages.

## Context

The legacy UI (`ui-legacy/public/components/permissions.vue` + `permission-dialog.vue` + `member-select.vue`) provides a full-featured permissions editor used on dataset and application detail pages. The new UI currently uses `private-access.vue` (a simple public/account toggle) in those pages — nowhere near parity.

The existing `permissions-editor.vue` in the new UI (used only in the share-dataset wizard) has visibility + contrib profile dropdowns but no detailed mode. It stays as-is for the wizard. The new components below replace `private-access` usage in dataset/app pages only.

## Components to Create

### 1. `ui/src/components/permissions/permissions.vue`

Main permissions component, direct port of `ui-legacy/public/components/permissions.vue`.

**Features (all from legacy):**

| Feature | Description |
|---------|-------------|
| Visibility dropdown | public, privateUser, privateOrg, privateOrgContrib, sharedInOrg |
| Contributor profiles | adminOnly, contribWriteData, contribWriteNoBreaking, contribWriteAll |
| Manage own lines toggle | `v-switch` for REST datasets with `lineOwnership` — creates `{type:'user', id:'*', classes:['manageOwnLines'], operations:['readSafeSchema']}` |
| Detailed mode toggle | `v-switch` to show/hide the permissions data table + add button |
| Permissions data table | Lists all permissions with scope column (public/user/org+dept+roles) and actions column (permission classes + operations) |
| Add permission button | Opens `permission-dialog` to create a new permission entry |
| Edit permission button | Opens `permission-dialog` pre-filled with the existing permission |
| Delete permission button | Removes a permission entry and saves |
| Auto-enable detailed mode | If existing permissions don't fit the simple presets, detailed mode turns on automatically |
| Warning: public app + private datasets | `hasPrivateParents` prop — shows warning when making app public but it uses private datasets |
| Warning: private dataset + public apps | `hasPublicDeps` prop — shows warning when making dataset private while used in public apps |
| Department documentation link | When resource has a department, shows a tutorial alert linking to department docs |

**Props:**
```typescript
{
  resource: any              // dataset or application object
  resourceType: 'datasets' | 'applications'
  resourceUrl: string        // full API path e.g. $apiPath + '/datasets/' + id
  api: any | null            // fetched API doc (openapi JSON) for permission classes, null if not loaded
  disabled: boolean          // true if user lacks setPermissions
  hasPublicDeps?: boolean    // dataset is used in public apps
  hasPrivateParents?: boolean // app uses private datasets
}
```

**Emits:** `permissions` (array) — emitted after fetch and after every save.

**Key implementation details:**
- Fetches permissions from `GET {resourceUrl}/permissions` on mount
- Saves via `PUT {resourceUrl}/permissions`
- Fetches owner details from `$sdUrl/api/{ownerType}s/{ownerId}` when detailed mode is activated (to get departments, roles, partners)
- Permission class map built from `api.paths[path][method]['x-permissionClass']` — same logic as legacy
- All permission type checker functions ported: `isPublicPermission`, `isSharedInOrgPermission`, `isPrivateOrgContribPermission`, `isManageOwnLinesPermission`, `isContribWriteAllPermission`, `isContribWriteDataPermission`, `isContribWriteNoBreakingPermission`, `isInDepartmentPermission`
- `contribProfileItems` conditional on `resource.isRest`, `resource.file`, `resource.isVirtual`
- Visibility items disable private options when `hasPublicDeps && isPublic`
- Visibility items disable public when `hasPrivateParents && !isPublic`

### 2. `ui/src/components/permissions/permission-dialog.vue`

Dialog for adding/editing individual permissions. Direct port of `ui-legacy/public/components/permission-dialog.vue`.

**Features:**

| Feature | Description |
|---------|-------------|
| Scope selector | v-select with options: Public, User, Organization |
| Organization sub-type | v-select: "Owner organization" or "Among partner organizations" |
| Owner org: department filter | v-select: All departments, specific department, No department |
| Owner org: role filter | v-select multiple: roles from `owner.roles` (admin, contrib, user) |
| Partner org: partner selector | v-select from `owner.partners` list |
| User sub-type | v-select: All platform users, Member of org, User by email |
| Member search | `member-select` autocomplete (3+ chars, searches directory API) |
| Email input | v-text-field for user-by-email |
| Permission classes | v-select multiple from `permissionClasses` keys (list, read, readAdvanced, write, manageOwnLines, use) — restricted for public scope (only read, list, use) |
| Expert mode toggle | v-switch to show operation-level select |
| Operations selector | v-select multiple with grouped operations by class |
| Auto-validation rules | Selecting `list` class auto-adds `read`; selecting `list` operation auto-adds `readDescription` |
| Restricted classes for public | When scope is public, only read/list/use classes available |
| Validation | Dialog validate button disabled until: at least one class or operation selected; org permissions require id; org owner permissions require role or department; user permissions require id or email |

**Props:**
```typescript
{
  modelValue?: any           // existing permission to edit (undefined = new)
  permissionClasses: Record<string, {id: string, title: string, class: string}[]>
  owner: any                 // owner details with departments, roles, partners
}
```

**Emits:** `update:modelValue` with the permission object when validated.

### 3. `ui/src/components/permissions/member-select.vue`

Autocomplete for searching organization members. Direct port of `ui-legacy/public/components/member-select.vue`.

**Features:**
- Searches `$sdUrl/api/organizations/{orgId}/members?q={search}` after 3+ characters
- Displays member name, email, role, department in dropdown items
- Returns `{id, name, email}` object
- Shows currently selected member even if not in search results

**Props:**
```typescript
{
  modelValue: {id: string, name: string, email?: string} | null
  organization: {id: string, name: string}
}
```

## Integration Changes

### Dataset page (`ui/src/pages/dataset/[id]/index.vue`)

Replace:
```html
<private-access v-model="dataset" />
```
With:
```html
<permissions
  :resource="dataset"
  resource-type="datasets"
  :resource-url="resourceUrl"
  :api="datasetApi"
  :disabled="!can('setPermissions').value"
  :has-public-deps="hasPublicDeps"
/>
```

The dataset page needs to:
- Fetch `datasetApi` from `GET datasets/{id}/private-api-docs.json`
- Compute `hasPublicDeps` — check if any applications using this dataset are public (use existing `applicationsFetch` from the store, check for `visibility === 'public'` or equivalent)

### Application page (`ui/src/pages/application/[id]/index.vue`)

Replace:
```html
<private-access v-model="application" />
```
With:
```html
<permissions
  :resource="application"
  resource-type="applications"
  :resource-url="`${$apiPath}/applications/${application.id}`"
  :api="applicationApi"
  :disabled="!can('setPermissions')"
  :has-private-parents="hasPrivateParents"
/>
```

The application page needs to:
- Fetch `applicationApi` from `GET applications/{id}/api-docs.json`
- Compute `hasPrivateParents` — check if any of the application's configured datasets are private

## Test Fixture Changes

### `dev/resources/organizations.json`

Add partners to `test_org1`:
```json
{
  "id": "test_org1",
  "partners": [
    {"id": "test_org2", "name": "Test Org 2"},
    {"id": "test_org3", "name": "Test Org 3"}
  ]
}
```

This gives us:
- `test_org1`: has departments (dep1, dep2) + partners (test_org2, test_org3) + multiple roles (admin, contrib, user)
- `test_user1`: admin of test_org1 — main test actor
- `test_user5`: contrib of test_org1 — for contrib permission tests
- `test_user8`: user of test_org1 — for user role tests

No changes needed to `users.json`.

## E2E Test Plan

### Test file: `tests/features/ui/permissions.e2e.spec.ts`

All tests use the `goToWithAuth` fixture from `tests/fixtures/login.ts`.

**Setup:** Before all tests, create a file-based dataset and an application owned by `test_org1` via API (as `test_user1`).

#### Test Group 1: Visibility (Dataset)

1. **Default visibility is privateOrg for org-owned dataset**
   - Navigate to dataset page as test_user1 (admin of test_org1)
   - Open Share > Permissions tab
   - Verify visibility dropdown shows "uniquement les administrateurs de l'organisation Test Org 1"

2. **Change visibility to sharedInOrg**
   - Select "tous les utilisateurs de l'organisation Test Org 1"
   - Verify selection persists after page reload
   - Verify via API that permissions include org-wide read+list permission

3. **Change visibility to public**
   - Select "tout le monde"
   - Verify via API that public read+list permission exists

4. **Change visibility back to privateOrg**
   - Select "uniquement les administrateurs"
   - Verify public permission removed via API

#### Test Group 2: Contributor Profiles (Dataset)

5. **Default contrib profile is adminOnly**
   - Verify contrib profile dropdown shows "uniquement les administrateurs"

6. **Set contribWriteData profile**
   - Select "les contributeurs peuvent modifier les données compatibles"
   - Verify via API: org permission with contrib role + writeData operations

7. **Set contribWriteAll profile**
   - Select "les contributeurs peuvent tout modifier et supprimer"
   - Verify via API: org permission with contrib role + write class + delete operation

#### Test Group 3: Detailed Mode (Dataset)

8. **Enable detailed mode**
   - Toggle "Édition détaillée des permissions"
   - Verify permissions data table appears
   - Verify "Ajouter des permissions" button appears

9. **Add a user permission by email**
   - Click add permission
   - Select scope "Utilisateur"
   - Select "Utilisateur désigné par son adresse email"
   - Enter "test_user2@test.com"
   - Select classes: read, list
   - Click validate
   - Verify new row in table shows "Utilisateur test_user2@test.com"
   - Verify via API

10. **Add an organization member permission**
    - Click add permission
    - Select scope "Utilisateur"
    - Select "Parmi les membres de Test Org 1"
    - Search "user5" in member autocomplete, select Test User5
    - Select classes: read, list
    - Click validate
    - Verify new row in table

11. **Add an all-users permission**
    - Click add permission
    - Select scope "Utilisateur"
    - Select "Tous les utilisateurs de la plateforme non anonymes"
    - Select classes: read, list
    - Click validate
    - Verify via API: `{type:'user', id:'*', classes:['read','list']}`

12. **Add a partner organization permission**
    - Click add permission
    - Select scope "Organisation"
    - Select "Parmi les organisations partenaires"
    - Select partner "Test Org 2"
    - Select classes: read, list
    - Click validate
    - Verify new row shows "Organisation Test Org 2"
    - Verify via API

13. **Add owner org permission with department filter**
    - Click add permission
    - Select scope "Organisation"
    - Select "Organisation propriétaire"
    - Select department "department 1 (dep1)"
    - Select role "contrib"
    - Select classes: read, list, readAdvanced
    - Click validate
    - Verify row shows department info

14. **Edit a permission**
    - Click edit icon on an existing permission row
    - Change classes (add write)
    - Click validate
    - Verify table updates
    - Verify via API

15. **Delete a permission**
    - Click delete icon on a permission row
    - Verify row disappears
    - Verify via API

#### Test Group 4: Expert Mode (Dialog)

16. **Toggle expert mode in permission dialog**
    - Open add permission dialog
    - Toggle "Mode expert"
    - Verify operations dropdown appears with grouped operations
    - Select specific operations (e.g., writeDescription, readDescription)
    - Click validate
    - Verify via API: permission has `operations` array

#### Test Group 5: Manage Own Lines (REST Dataset)

17. **Toggle manage own lines**
    - Create a REST dataset with `lineOwnership` enabled via API
    - Navigate to its permissions page
    - Toggle "Permettre à tous les utilisateurs externes..."
    - Verify via API: `{type:'user', id:'*', classes:['manageOwnLines'], operations:['readSafeSchema']}`

#### Test Group 6: Application Permissions

18. **Application visibility and contrib profiles work identically**
    - Navigate to application page as test_user1
    - Verify visibility dropdown works
    - Verify contrib profile dropdown works (for org-owned app)

19. **Application detailed permissions**
    - Enable detailed mode
    - Add a user permission
    - Verify via API

#### Test Group 7: Warnings

20. **Warning when making dataset private while used in public app**
    - Make dataset public, configure an application that uses it, make app public
    - Navigate to dataset permissions
    - Attempt to set visibility to private
    - Verify warning message appears

21. **Warning when making app public while using private datasets**
    - Make a dataset private
    - Configure an application using that dataset
    - Navigate to app permissions
    - Verify warning about private datasets

#### Test Group 8: Auto-validation Rules

22. **Selecting list class auto-adds read**
    - In permission dialog, select only "list" class
    - Verify "read" is automatically selected

#### Test Group 9: Access Control

23. **Non-admin cannot edit permissions**
    - Log in as test_user5 (contrib of test_org1)
    - Navigate to org-owned dataset
    - Verify permission controls are disabled

## i18n

All translations ported from legacy `permissions.vue` and `permission-dialog.vue` i18n blocks. Both French and English. Key additions beyond what `permissions-editor.vue` already has:

- Permission dialog labels (scope, expert mode, department, partner, member, email, roles, allUsers, allDeps, noDep, etc.)
- Permission class names (list, read, readAdvanced, write, admin, use, manageOwnLines)
- Table labels (scope, actions, allRoles, restrictedRoles)
- Detailed mode, add/edit/cancel/validate

## Out of Scope

- `private-access.vue` remains as-is for base-apps and remote-services pages
- `permissions-editor.vue` remains as-is for the share-dataset wizard
- Owner change functionality (separate feature)
- Read API key management (separate feature)
