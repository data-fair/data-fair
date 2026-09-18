// data-fair wiring for the text-search util. This is the ONLY file under text-search/ allowed to
// import data-fair modules; everything else must stay extractable to @data-fair/lib.
import config from '#config'
import mongo from '#mongo'
import { defineTextSearch, createStatsProvider, type StatsProvider } from './index.ts'

// config.catalogSearch.language is a MONGO text-index language name ('french'), because the
// legacy $text index's default_language requires one. The analyzer takes ISO 639-1 codes. A
// value that silently fails to map disables stemming and stopword removal entirely, which is
// invisible at runtime and destroys ranking — so map explicitly and throw on anything unknown.
const LANGUAGE_CODES: Record<string, string> = { french: 'fr', english: 'en', none: 'none' }
export const analyzerLanguage = (mongoLanguage: string): string => {
  const code = LANGUAGE_CODES[mongoLanguage]
  if (!code) throw new Error(`text-search: unsupported catalogSearch.language "${mongoLanguage}" — expected one of ${Object.keys(LANGUAGE_CODES).join(', ')}`)
  return code
}

/** Mirrors the weights of the `fulltext` index it replaces (see api/src/mongo.ts). */
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
  language: analyzerLanguage(config.catalogSearch.language),
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
  language: analyzerLanguage(config.catalogSearch.language),
  version: 1
})

// mongo.datasets / mongo.applications are resolved on first use, never at import time: router
// modules are dynamically imported before mongo.init() runs (see app.js), so touching them at
// module scope crash-loops the API with "db was not connected". Consumers still write
// `datasetsStats`/`applicationsStats` as plain values — only the underlying provider is deferred.
let datasetsStatsInner: StatsProvider | undefined
export const datasetsStats: StatsProvider = {
  get: (terms, ownerScope) => {
    datasetsStatsInner ??= createStatsProvider(mongo.datasets as any, datasetsTextSearch.definition)
    return datasetsStatsInner.get(terms, ownerScope)
  }
}

let applicationsStatsInner: StatsProvider | undefined
export const applicationsStats: StatsProvider = {
  get: (terms, ownerScope) => {
    applicationsStatsInner ??= createStatsProvider(mongo.applications as any, applicationsTextSearch.definition)
    return applicationsStatsInner.get(terms, ownerScope)
  }
}
