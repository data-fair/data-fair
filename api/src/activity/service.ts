import type { SessionState } from '@data-fair/lib-express'
import mongo from '#mongo'
import * as findUtils from '../misc/utils/find.ts'

// activity feeds support a single ?status= filter, shared by both collections
const fieldsMap = { status: 'status' }

// fetch the most recently updated datasets and applications matching the query,
// each filtered by the session's permissions on the relevant resource type
export const findActivityResources = async (locale: string, reqQuery: Record<string, string>, sessionState: SessionState, size: number) => {
  const db = mongo.db
  const datasetsQuery = findUtils.query(reqQuery, locale, sessionState, 'datasets', fieldsMap, false)
  const applicationsQuery = findUtils.query(reqQuery, locale, sessionState, 'applications', fieldsMap, false)
  const [datasets, applications] = await Promise.all([
    db.collection('datasets')
      .find(datasetsQuery).limit(size).sort({ updatedAt: -1 }).project({ id: 1, _id: 0, title: 1, updatedAt: 1 }).toArray(),
    db.collection('applications')
      .find(applicationsQuery).limit(size).sort({ updatedAt: -1 }).project({ id: 1, _id: 0, title: 1, updatedAt: 1 }).toArray()
  ])
  return { datasets, applications }
}
