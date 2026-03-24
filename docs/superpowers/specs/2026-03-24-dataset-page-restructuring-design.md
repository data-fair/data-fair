# Dataset Page Restructuring Design

## Overview

Restructure the dataset pages in the new UI to achieve feature parity with the legacy UI, reorganize sections for better UX, and fix existing issues.

## Changes

### 1. Merged Description + Metadata (flat, top of page)

Remove the separate "Description" and "Métadonnées" `layout-section-tabs` sections. Replace with a flat readonly display at the top of the main page (no section header, no SVG):

- Title (large text)
- Description (rendered markdown/HTML)
- Image (if present, right-aligned)
- All metadata fields with icons: owner, license, dates, counts, keywords, topics, origin, temporal/spatial coverage, frequency, creator, custom metadata
- Chips for keywords/topics

This is the first visible element on the page, before any `layout-section-tabs` sections.

### 2. Schema section (with Enrichissements tab)

Existing "Schéma" section gains a second tab:

- Tab 1: "Schéma" — existing `dataset-schema-view` (unchanged)
- Tab 2: "Enrichissements" — existing `dataset-extensions.vue` in readonly mode (editable in edit-metadata)

SVG: **Team building _Two Color.svg** (note space before underscore in filename)

Note: The current code guards the schema section behind `d.finalizedAt`. This guard must be relaxed so schema is also visible in draft mode.

### 3. "CONSULTER LA DONNEE" section

New `layout-section-tabs` section with two tabs:

**Tab 1: "Données"** — link cards to individual visualization routes:

- `/dataset/[id]/table` — always shown (when finalized, non-meta-only)
- `/dataset/[id]/map` — shown if dataset has bbox and remote services enabled
- `/dataset/[id]/files` — shown if file properties exist
- `/dataset/[id]/thumbnails` — shown if schema has image property
- `/dataset/[id]/revisions` — shown if REST dataset with history

Each card shows a title and icon. The old `/data` route is removed (or redirects to `/table`). The standalone "Applications" `layout-section-tabs` section is also removed (merged here as tab 2).

Each individual route page embeds the corresponding d-frame visualization with proper breadcrumbs.

**Tab 2: "Applications"** — existing application cards grid (moved from standalone section)

SVG: **Data storage_Two Color.svg**

### 4. "Partage" section

Restructured with additional tabs:

- Tab 1: "Permissions" — existing permissions component (unchanged)
- Tab 2: "Intégrer dans un site" — moved from actions menu, rendered inline as tab content (not a dialog)
- Tab 3: "Clé d'API en lecture" — moved from its own standalone section
- Tab 4: "Sites de publication" — existing tab
- Tab 5: "Catalogues" — existing tab (conditional)
- Tab 6: "Voir aussi" — existing related datasets tab

SVG: **Share_Two Color.svg**

### 5. "Activité" section

Restructured with additional tabs:

- Tab 1: "Journal" — existing `journal-view` (unchanged)
- Tab 2: "Traçabilité" — moved from standalone `/events` page, embedded d-frame inline
- Tab 3: "Notifications" — moved from actions dialog, converted from dialog-wrapped iframe to inline `d-frame` tab content. **Review against legacy UI for feature parity.**
- Tab 4: "Webhooks" — moved from actions dialog, converted from dialog-wrapped iframe to inline `d-frame` tab content (conditional on admin). **Review against legacy UI for feature parity.**

The standalone `/events` route is removed (or redirects to main page with Activité focus).

SVG: **Settings_Monochromatic.svg** (with `svgNoMargin`)

### 6. Actions menu cleanup

**Main page (`dataset-actions.vue`):**
- Keep: Edit metadata link, downloads, uploads, change owner, delete, delete all lines, edit data, use API
- Remove: Integration dialog (now in Partage), Notifications dialog (now in Activité), Webhooks dialog (now in Activité), Events/traceability link (now in Activité), View data link (now in Consulter la donnée)

**Edit-metadata page:**
- Remove the NAVIGATION section entirely from its right sidebar

**Breadcrumbs:** Ensure all dataset sub-pages (`/table`, `/map`, `/files`, `/thumbnails`, `/revisions`, `/edit-metadata`, `/edit-data`, `/api-doc`) have proper breadcrumbs: `Datasets > {title} > {page name}`.

### 7. Draft mode reduced content

When dataset has `draftReason`, the main page shows only:

- `dataset-status` component (draft validation area)
- Merged Description + Metadata (readonly, flat)
- Schema section (with Enrichissements tab)

Hidden in draft mode:
- Consulter la donnée section (with Applications tab)
- Partage section
- Activité section
- "Edit metadata" link in actions menu (route itself remains accessible if navigated to directly)

### 8. "Valider le brouillon" fix

- Fix the broken validation flow (debug POST to `/draft` endpoint)
- Align buttons to the right (currently incorrectly centered)

### 9. Edit-metadata changes

**New "Metadata" tab:** Contains only editable metadata fields (license, topics, keywords, origin, temporal/spatial coverage, frequency, creator, image, custom metadata) presented as a simple form — no icons, just labels and inputs. The readonly info that was in the right column of "Informations" is no longer shown here (it's on the main page).

**"Informations" tab simplified:** Left column only — title, summary, description, slug. Right column (readonly owner/dates/counts info) removed.

### 10. Confirmation dialog on save in edit-metadata

When clicking "Save":

1. A confirmation dialog always appears (regardless of AI configuration): "Are you sure you want to save these changes?"
2. Dialog contains:
   - "Summarize changes" button (only visible when AI assistant is configured via `agentsIntegration`)
   - "Cancel" and "Save" action buttons
3. "Summarize changes" behavior:
   - Compute jsdiff between stable serialization of `serverData` and `data`
   - Send diff to agents service `/summary` endpoint (endpoint exists externally — frontend work only)
   - Display AI-generated summary in the dialog
4. User can then confirm or cancel

### 11. Remove "Charger plusieurs lignes" from main page

Remove `dataset-rest-upload-actions` from `dataset-actions.vue` on the main dataset page. It already exists in edit-data where it belongs.

### 12. SVG illustrations mapping

| Section | SVG |
|---------|-----|
| Schema | Team building _Two Color.svg |
| Consulter la donnée | Data storage_Two Color.svg |
| Partage | Share_Two Color.svg |
| Activité | Settings_Monochromatic.svg (svgNoMargin) |

Note: The merged Description + Metadata section has no SVG (flat, no section header).

## Testing Strategy

- After each structural change, run existing e2e tests and use playwright-healer to fix breakage
- New e2e tests:
  - Draft mode: verify reduced content (sections hidden, edit-metadata link hidden)
  - Data visualization routes: navigate to `/table`, `/map`, etc., verify they load
  - Confirmation dialog: trigger save in edit-metadata, verify dialog appears, verify AI summary button when configured
  - Partage section: verify new tabs (integration, read API key) render correctly
  - Activité section: verify new tabs (traçabilité, notifications, webhooks) render correctly
  - Actions menu: verify removed items are gone, kept items still work
