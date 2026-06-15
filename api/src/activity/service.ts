import mongo from '#mongo'

// fetch the most recently updated datasets and applications matching the query
export const findActivityResources = async (query: Record<string, any>, size: number) => {
  const db = mongo.db
  const [datasets, applications] = await Promise.all([
    db.collection('datasets')
      .find(query).limit(size).sort({ updatedAt: -1 }).project({ id: 1, _id: 0, title: 1, updatedAt: 1 }).toArray(),
    db.collection('applications')
      .find(query).limit(size).sort({ updatedAt: -1 }).project({ id: 1, _id: 0, title: 1, updatedAt: 1 }).toArray()
  ])
  return { datasets, applications }
}
