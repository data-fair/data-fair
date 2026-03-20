# Dataset Edit-Metadata & Detail Pages E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive e2e tests for the dataset edit-metadata page (info editing, schema editing, save/diff detection, leave guard) and dataset home page sections.

**Architecture:** Playwright e2e tests following the existing `tests/features/ui/` pattern. Tests use the `login.ts` fixture for auth, `sendDataset` helper for dataset creation, and Axios API calls for setup/verification. Tests run against a real dev environment. Note: tests are order-dependent within the `describe` block — earlier tests modify shared dataset state.

**Tech Stack:** Playwright, existing test fixtures (`tests/fixtures/login.ts`), test support utilities (`tests/support/axios.ts`, `tests/support/workers.ts`)

---

### Task 1: Edit-metadata page loads with all expected sections

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add test for section visibility**

The dataset is created by `sendDataset` which waits for finalization, so it will have no `draftReason` and sections should all be visible.

```ts
test('edit-metadata page shows info, schema, extensions and attachments sections', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')

  // Wait for page to load
  await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })

  // Verify all expected sections are present (section IDs from layout-section-tabs)
  await expect(page.locator('#info')).toBeVisible()
  await expect(page.locator('#schema')).toBeVisible()
  await expect(page.locator('#extensions')).toBeVisible()
  await expect(page.locator('#attachments')).toBeVisible()

  // Verify navigation panel
  await expect(page.getByText(/Retour à la fiche|Back to home/)).toBeVisible()
  await expect(page.getByText(/Voir les données|View data/)).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "edit-metadata page shows" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add edit-metadata section visibility e2e test"
```

### Task 2: Edit dataset title and save

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add test for editing title and saving**

Uses label-based selector for robustness — the dataset-info component renders a `v-text-field` with `:label="t('title')"` which is "Titre" in French (i18n_lang=fr cookie is set by the fixture).

```ts
test('edit-metadata: editing title shows save button and persists changes', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
  await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })

  // Save button should NOT be visible initially (no diff)
  await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible()

  // Find and edit the title field
  const titleInput = page.locator('#info').getByLabel(/Titre|Title/)
  await titleInput.click()
  await titleInput.fill('Modified Title E2E')

  // Save button should now be visible (diff detected)
  await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

  // Click save
  await page.getByRole('button', { name: /Enregistrer|Save/ }).click()

  // Save button should disappear after successful save (no more diff)
  await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

  // Verify via API that the title was actually persisted
  const ax = await axiosAuth('test_user1@test.com')
  const res = await ax.get(`api/v1/datasets/${datasetId}`)
  expect(res.data.title).toBe('Modified Title E2E')
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "editing title" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add edit-metadata title editing e2e test"
```

### Task 3: Schema section displays properties

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add test for schema property display and interaction**

The dataset `dataset1.csv` has columns: id, adr, some date, loc, bool, nb. After finalization the schema shows these as properties in `dataset-properties-slide`.

```ts
test('edit-metadata: schema section shows dataset properties', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
  await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })

  // The schema section should show the column count
  const schemaSection = page.locator('#schema')
  await expect(schemaSection.getByText(/colonne|column/i)).toBeVisible()

  // Click on one of the property buttons to expand its details
  await schemaSection.getByRole('button', { name: /adr/i }).click()

  // Wait for the detail panel to appear (switchProperty uses nextTick)
  await expect(schemaSection.getByText(/Clé dans la source|Key in the source/i)).toBeVisible({ timeout: 5000 })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "schema section shows" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add edit-metadata schema section e2e test"
```

### Task 4: Edit property label in schema and save

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add test for editing a property label**

```ts
test('edit-metadata: editing a schema property label triggers diff and saves', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
  await expect(page.locator('#schema')).toBeVisible({ timeout: 10000 })

  // Click on the "adr" property to open its details
  const schemaSection = page.locator('#schema')
  await schemaSection.getByRole('button', { name: /adr/i }).click()

  // Wait for detail panel and label field to appear
  const labelField = schemaSection.getByLabel(/Libellé|Label/)
  await expect(labelField).toBeVisible({ timeout: 5000 })

  // Edit the label
  await labelField.click()
  await labelField.fill('Adresse complète')

  // Save button should appear
  await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

  // Save
  await page.getByRole('button', { name: /Enregistrer|Save/ }).click()
  await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).not.toBeVisible({ timeout: 10000 })

  // Verify via API
  const ax = await axiosAuth('test_user1@test.com')
  const res = await ax.get(`api/v1/datasets/${datasetId}`)
  const adrProp = res.data.schema.find((p: any) => p.key === 'adr')
  expect(adrProp.title).toBe('Adresse complète')
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "editing a schema property" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add edit-metadata schema property editing e2e test"
```

### Task 5: Leave guard prevents navigation with unsaved changes

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add test for leave guard**

The `useLeaveGuard` composable uses `window.confirm()` for in-app navigation (via `onBeforeRouteLeave`), which creates a dialog of type `'confirm'`. Dismissing the dialog cancels navigation.

```ts
test('edit-metadata: leave guard warns when navigating away with unsaved changes', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}/edit-metadata`, 'test_user1')
  await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })

  // Make a change
  const titleInput = page.locator('#info').getByLabel(/Titre|Title/)
  await titleInput.click()
  await titleInput.fill('Unsaved Change E2E')

  // Wait for save button to confirm diff is detected
  await expect(page.getByRole('button', { name: /Enregistrer|Save/ })).toBeVisible({ timeout: 5000 })

  // Set up dialog handler to dismiss the confirm dialog (cancel navigation)
  page.on('dialog', async dialog => {
    await dialog.dismiss()
  })

  // Try to navigate away via the "Back to home" link
  await page.getByText(/Retour à la fiche|Back to home/).click()

  // Should still be on edit-metadata page (navigation was cancelled)
  await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 5000 })
  await expect(page.getByText(/Informations|Information/)).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "leave guard" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add edit-metadata leave guard e2e test"
```

### Task 6: Dataset home page sections render with data

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add tests for home page sections**

```ts
test('dataset home page shows description, metadata, schema and activity sections', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')

  // Wait for page to fully load
  await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })

  // Description section with dataset title
  await expect(page.locator('#description')).toBeVisible()

  // Metadata section with info
  await expect(page.locator('#metadata')).toBeVisible()

  // Schema section
  await expect(page.locator('#schema')).toBeVisible()

  // Share section with permissions
  await expect(page.locator('#share')).toBeVisible()

  // Activity section with journal
  await expect(page.locator('#activity')).toBeVisible()
})

test('dataset home page displays record count', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
  await expect(page.locator('#metadata')).toBeVisible({ timeout: 10000 })

  // dataset1.csv has 2 data rows
  await expect(page.getByText(/enregistrements|records/)).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "home page" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add dataset home page sections e2e tests"
```

### Task 7: Navigation between dataset pages

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 1: Add test for navigating via dataset-actions links**

```ts
test('dataset home page action links navigate to edit-metadata and data pages', async ({ page, goToWithAuth }) => {
  await goToWithAuth(`/data-fair/dataset/${datasetId}`, 'test_user1')
  await expect(page.locator('.text-h6').first()).toBeVisible({ timeout: 10000 })

  // Click the "Edit metadata" action link in the right navigation
  await page.getByText(/Éditer les métadonnées|Edit metadata/).click()
  await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}/edit-metadata`), { timeout: 10000 })

  // Navigate back via "Back to home" link (no unsaved changes so no leave guard)
  await expect(page.getByText(/Informations|Information/)).toBeVisible({ timeout: 10000 })
  await page.getByText(/Retour à la fiche|Back to home/).click()
  await expect(page).toHaveURL(new RegExp(`/dataset/${datasetId}$`), { timeout: 10000 })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts --project e2e -g "action links" --timeout 30000`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "test: add dataset page navigation e2e test"
```
