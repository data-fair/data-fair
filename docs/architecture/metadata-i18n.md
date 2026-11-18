# Multilingual metadata (mockup)

An organization enters its datasets metadata in a default language and translates it into other
supported languages. Only the descriptive texts are translated, never the data values nor the
column keys.

## Settings

`metadataI18n` on the root settings of an organization (departments inherit it):
`{ active, defaultLocale, locales }`. Locale codes are 2 or 3 lowercase letters; on write they are
lowercased, deduplicated, and the default locale is removed from `locales`.
`GET /settings/:type/:id/metadata-i18n` returns `{ active: false }` or
`{ active: true, defaultLocale, locales }` with `locales` starting with the default one.

Deactivating the feature or removing a locale keeps the stored translations: they are dormant, not
deleted.

## Storage

The base keyword holds the default locale, as json-layout does for schemas; the other locales go in
`x-i18n-<keyword>[locale]`:

| where | translated keywords |
|---|---|
| dataset | `x-i18n-title`, `x-i18n-summary`, `x-i18n-description`, `x-i18n-creator`, `x-i18n-spatial`, `x-i18n-keywords` (a free list per locale), `x-i18n-customMetadata[locale][key]` (free texts only) |
| attachment | `x-i18n-title`, `x-i18n-description` |
| column | `x-i18n-title`, `x-i18n-description`, `x-i18n-x-labels[locale][value]` |
| topic (settings) | `x-i18n-title`, copied on datasets and applications with the topic |
| custom metadata definition (settings) | `x-i18n-title`, `x-i18n-description`, `x-i18n-enum[locale][value]` |

A value of a closed list (custom metadata enum, coded column value, frequency) is stored once, in
the default language: only its label is translated. The origin is a URL, the dates are not texts:
neither is translated.

On write (`api/src/datasets/utils/metadata-i18n.ts`, `cleanDatasetTranslations`) translations are
trimmed, empty ones dropped, a map left empty is unset, and a value label translated for a value the
column no longer labels is dropped. The column translations count as innocuous schema changes
(`removeInnocuous` in `data-schema.ts`): translating a file dataset never re-finalizes it.

## Localized reads

`lang=<code>` on `GET /datasets/:id`, `GET /datasets`, `/schema`, `/safe-schema` and
`/values-labels/:field` returns a monolingual document: each text is replaced by its translation
when there is one, the base text otherwise, and the `x-i18n-*` keys are removed. Without `lang` the
raw document is returned, which is what the back-office edit forms need. The language is explicit
on purpose, never taken from the session or `Accept-Language`, so an existing client never gets
another language than before. With `select`, the translations of the selected keywords are read
too. The labels of custom metadata list values are not localized here: they live in the owner
settings.

## Search

`_searchText` (`computeSearchText`) also holds the translated titles, summaries and keywords and
the translated column titles, so `q=` finds a dataset in any of its languages. The analyzer stays
the deployment's one, a translation is stemmed with it. A patch touching an `x-i18n-*` key
recomputes the index. Datasets translated before this change are indexed again at their next
metadata write.

## Back-office

The page provides one editing locale (`provideMetadataI18n`) shared by the structure and metadata
sections. Outside the default locale the forms only show the translatable fields, each with its
source text as placeholder (the markdown editors included), and lock the others; the attachments
dialog edits the translations of an existing attachment, and keeps them when the attachment is
edited in the default locale. The counters only count what the forms can translate: an optional
field the settings deactivated and a custom metadata of a closed list are left out.

## Not done yet

- applications are not translated;
- the settings texts other than the topics and the custom metadata: the tab titles, the renamed
  labels and tooltips of the standard fields, the license titles (a license is copied on the
  dataset, its translation would have to follow as the topic's does);
- the attachments are not in the assistant's translation tools (they are saved apart from the
  metadata form);
- the `lang` parameter is not in the OpenAPI documents;
- the catalog exports (DCAT…) and the notifications ignore the translations.
