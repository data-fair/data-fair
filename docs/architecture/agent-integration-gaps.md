# AI Agent Integration — Functional Gaps Analysis

This document identifies areas of Data Fair where AI assistance would be valuable but is not yet implemented. It complements the [agent integration architecture](./agent-integration.md) which documents the current state.

## Current Coverage

- **Navigation**: get location, list pages, navigate (3 tools)
- **Dataset metadata**: list, describe (2 tools)
- **Dataset data queries**: schema, search, aggregate, metric, field values (5 tools + 1 subagent)
- **Dataset summary**: read info, set summary (2 tools + 1 subagent)
- **Dataset description**: set description (1 tool + 1 subagent)
- **Dataset changes**: read diff (1 tool + 1 subagent)
- **Dataset expressions**: context, sample, test, set (4 tools + 1 subagent)
- **Applications**: list, describe, list base apps (3 tools)
- **Application config**: VJSF sub-agent (1 subagent)
- **Geolocation**: geocode, user location (2 tools)
- **Connectors**: list/describe processings and catalogs (0-4 conditional tools)

**Total: 23 tools, 6 subagents, 6 action buttons**

---

## Identified Gaps

### 1. Dataset Description Generation

**Current state:** `set_dataset_summary` generates short 200-300 char summaries. The `description` field (longer, richer) in `dataset-info.vue` has no AI assistance.

**Opportunity:** An action button "Help write a description" next to the description textarea. The agent reads the schema, sample data, and existing metadata, then drafts a detailed description. Same pattern as the existing summarize-dataset action.

**Location:** `ui/src/components/dataset/dataset-info.vue`

---

### 2. Dataset Metadata Completion (topics, keywords, license)

**Current state:** `dataset-metadata-form.vue` has manual dropdowns for license, topics, keywords, origin, image. No AI help.

**Opportunity:** An action button "Help complete metadata" on the edit-metadata page that reads the dataset content and suggests appropriate topics (from the owner's configured list), keywords, license, and temporal/spatial metadata. Valuable because users often skip metadata or don't know what to fill in.

**Location:** `ui/src/pages/dataset/[id]/edit-metadata.vue`, `ui/src/components/dataset/dataset-metadata-form.vue`

---

### 3. Schema Annotation Help (column titles, descriptions, labels)

**Current state:** `dataset-schema.vue` and `dataset-property-labels.vue` allow manual setting of titles, descriptions, and labels for each column. Tedious for wide datasets.

**Opportunity:** An action button "Help annotate schema" that reads sample data and column names, then suggests human-readable titles and descriptions for each column. Especially valuable for datasets with cryptic column keys (e.g., `col_a1`, `montant_ht`).

**Location:** `ui/src/components/dataset/dataset-schema.vue`

---

### 4. Dataset Property Transformation Suggestions

**Current state:** `dataset-property-transform.vue` and `dataset-property-capabilities.vue` allow configuring column-level transforms and capabilities. Users need to understand the options.

**Opportunity:** A contextual tool that explains available transforms/capabilities for a column type and suggests appropriate ones based on data content.

**Location:** `ui/src/components/dataset/dataset-property-transform.vue`

---

### 5. Virtual Dataset Configuration Help

**Current state:** `dataset-virtual.vue` allows building virtual datasets by composing children datasets. The UI is complex with child selection and schema compatibility.

**Opportunity:** A conversational action "Help configure virtual dataset" where the user describes what combined dataset they want, and the agent searches existing datasets, checks schema compatibility, and suggests a configuration.

**Location:** `ui/src/components/dataset/dataset-virtual.vue`

---

### 6. Master Data Configuration Help

**Current state:** `dataset-master-data.vue` uses VJSF to configure master data features (shared orgs, single/bulk searches, virtual datasets, standard schema). Complex config with multiple sections.

**Opportunity:** The VJSF component already supports `:sub-agent="true"` (used for application config). Adding it here would let users configure master data through natural language, following the existing `appConfig_form` pattern.

**Location:** `ui/src/components/dataset/dataset-master-data.vue`

---

### 7. Data Quality / Anomaly Detection

**Current state:** Data query tools let the agent search/aggregate data, but no tool targets quality analysis specifically.

**Opportunity:** An action button "Check data quality" that uses a specialized subagent prompt to check null rates, duplicate values, outliers, and format inconsistencies. Could reuse existing data tools with a dedicated subagent.

**Location:** `ui/src/pages/dataset/[id]/data.vue` or `ui/src/components/dataset/table/dataset-table.vue`

---

### 8. Application Creation Wizard Assistance

**Current state:** `new-application.vue` is a stepper (choose type, select base app, set title). No AI help.

**Opportunity:** A conversational flow where the user describes what visualization they want, the agent recommends the best base application using `list_base_applications`, and navigates through the creation wizard.

**Location:** `ui/src/pages/new-application.vue`

---

### 9. Dataset Creation Guidance

**Current state:** `new-dataset.vue` is a stepper (choose type: file, REST, virtual, metaonly). No AI help.

**Opportunity:** A conversational action "Help me create a dataset" where the user describes their data source and needs, and the agent recommends the right dataset type and walks through the steps.

**Location:** `ui/src/pages/new-dataset.vue`

---

### 10. Publication / Sharing Workflow Assistance

**Current state:** `share-dataset.vue` is a 5-step wizard (portal, dataset, permissions, metadata, action). Complex for new users.

**Opportunity:** An action button "Help me publish this dataset" that guides the user through the workflow: checks metadata completeness, suggests missing fields, recommends permissions, assists with portal selection.

**Location:** `ui/src/pages/share-dataset.vue`

---

### 11. Storage Analysis / Optimization Suggestions

**Current state:** `storage.vue` shows statistics (dataset count, indexed bytes, stored bytes) and a treemap. Read-only display.

**Opportunity:** A read-only tool `get_storage_stats` that lets the agent answer "which datasets take the most space?", "am I close to my storage limit?", "which datasets haven't been updated in a long time?".

**Location:** Global tool in `ui/src/layouts/default-layout.vue`

---

### 12. Processing Run/Log Inspection

**Current state:** `list_processings` and `describe_processing` exist but only expose metadata. No access to run logs or execution history.

**Opportunity:** Tools like `get_processing_runs` and `get_processing_log` that let the agent help debug failed processings by reading run history and logs.

**Location:** `ui/src/composables/agent/connector-tools.ts` (conditional on processingsIntegration)

---

### 13. REST Dataset Data Entry Assistance

**Current state:** `edit-data.vue` allows editing REST dataset rows through a table. Manual data entry only.

**Opportunity:** A conversational action "Help me add data" where the user describes records in natural language, and the agent formats them according to the schema and submits via the REST API.

**Location:** `ui/src/pages/dataset/[id]/edit-data.vue`

---

### 14. Dataset Journal / Activity Tool

**Current state:** The API tracks events (structure updates, finalizations, etc.) via `journals.log`, with an embed page for display. No agent tool exposes this.

**Opportunity:** A read-only `get_dataset_journal` tool that answers "what happened to this dataset recently?", "when was it last updated?", "what changes were made?". Useful for auditing.

**Location:** `ui/src/composables/dataset/agent-tools.ts`

---

## Priority Matrix

| Priority | Gap | Value | Effort |
|----------|-----|-------|--------|
| ~~Done~~ | ~~1. Description generation~~ | ~~High — frequently needed~~ | ~~Low — pattern exists~~ |
| **High** | 2. Metadata completion | High — often skipped by users | Low-Med |
| **High** | 3. Schema annotation | High — very tedious manually | Med |
| **High** | 14. Dataset journal tool | Med-High — debugging/auditing | Low — read-only API call |
| **High** | 11. Storage stats tool | Med — account management | Low — read-only API call |
| **Med** | 7. Data quality analysis | High — unique value | Med — subagent prompt design |
| **Med** | 8. App creation guidance | Med — occasional use | Low — leverages existing tools |
| **Med** | 9. Dataset creation guidance | Med — occasional use | Low — conversational only |
| **Med** | 12. Processing logs | Med — debugging | Med — new API calls |
| **Med** | 6. Master data config | Med — complex feature | Low — VJSF pattern exists |
| **Low** | 5. Virtual dataset config | Med — niche feature | Med |
| **Low** | 10. Publication assistance | Med — wizard already exists | Med |
| ~~Done~~ | ~~13. REST data entry~~ | ~~Low-Med — niche use case~~ | ~~Med-High~~ |
| **Low** | 4. Property transforms | Low — niche | Med |
