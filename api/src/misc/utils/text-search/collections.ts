// data-fair wiring for the text-search util. This is the ONLY file under text-search/ allowed to
// import data-fair modules; everything else must stay extractable to @data-fair/lib.
import config from '#config'
import mongo from '#mongo'
import { defineTextSearch, createStatsProvider } from './index.ts'

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
  language: config.catalogSearch.language,
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
  language: config.catalogSearch.language,
  version: 1
})

export const datasetsStats = createStatsProvider(mongo.datasets as any, datasetsTextSearch.definition)
export const applicationsStats = createStatsProvider(mongo.applications as any, applicationsTextSearch.definition)
