// TODO: this will be replaced by a true activity concept based on a separate collection
// for now we create something similar based on recently updated datasets and applications

import express from 'express'
import * as findUtils from '../utils/find.js'
import mongo from '#mongo'

const router = express.Router()
export default router

router.get('', async (req, res) => {
  const db = mongo.db
  const query = findUtils.query(req, { status: 'status' })
  const size = findUtils.pagination(req.query)[1]
  const [datasets, applications] = await Promise.all([
    db.collection('datasets')
      .find(query).limit(size).sort({ updatedAt: -1 }).project({ id: 1, _id: 0, title: 1, updatedAt: 1 }).toArray(),
    db.collection('applications')
      .find(query).limit(size).sort({ updatedAt: -1 }).project({ id: 1, _id: 0, title: 1, updatedAt: 1 }).toArray()
  ])
  for (const d of datasets) d.type = 'dataset'
  for (const a of applications) a.type = 'application'

  const results = datasets.concat(applications)
    .map(line => {
      line.date = line.updatedAt
      delete line.updatedAt
      return line
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, size)

  res.send({
    results
  })
})
