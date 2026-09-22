// data-fair wiring for the text-search util. This is the ONLY file under text-search/ allowed to
// import data-fair modules; everything else must stay extractable to @data-fair/lib.
import config from '#config'
import mongo from '#mongo'
import { defineTextSearch, createStatsProvider, type ClearableStatsProvider } from './index.ts'

// The analyzer takes an ISO 639-1 code, which is exactly what `config.i18n.defaultLocale` already
// is ('fr'), so the catalog search has no language setting of its own: a deployment that runs in
// French gets a French analyzer by saying so once. `createAnalyzer` degrades to no stemming and no
// stopword removal for a language it has no stemmer for — which is the same degradation such a
// deployment already gets everywhere else, not a silent failure peculiar to search.
const language = config.i18n.defaultLocale

/** Weights follow the legacy `fulltext` index this replaces, with the new fields slotted in. */
export const datasetsTextSearch = defineTextSearch({
  fields: {
    title: 3,
    searchTerms: 3,
    summary: 2,
    description: 1,
    keywords: 1,
    'topics.title': 1,
    'owner.name': 1,
    'owner.departmentName': 1,
    _searchText: 1
  },
  language,
  version: 1
})

export const applicationsTextSearch = defineTextSearch({
  fields: {
    title: 3,
    summary: 2,
    description: 1,
    'owner.name': 1,
    'owner.departmentName': 1
  },
  language,
  version: 1
})

// mongo.datasets / mongo.applications are resolved on first use, never at import time: router
// modules are dynamically imported before mongo.init() runs (see app.js), so touching them at
// module scope crash-loops the API with "db was not connected". Consumers still write
// `datasetsStats`/`applicationsStats` as plain values — only the underlying provider is deferred.
let datasetsStatsInner: ClearableStatsProvider | undefined
export const datasetsStats: ClearableStatsProvider = {
  get: (terms, ownerScope) => {
    datasetsStatsInner ??= createStatsProvider(mongo.datasets as any, datasetsTextSearch.definition)
    return datasetsStatsInner.get(terms, ownerScope)
  },
  clear: () => datasetsStatsInner?.clear()
}

let applicationsStatsInner: ClearableStatsProvider | undefined
export const applicationsStats: ClearableStatsProvider = {
  get: (terms, ownerScope) => {
    applicationsStatsInner ??= createStatsProvider(mongo.applications as any, applicationsTextSearch.definition)
    return applicationsStatsInner.get(terms, ownerScope)
  },
  clear: () => applicationsStatsInner?.clear()
}
