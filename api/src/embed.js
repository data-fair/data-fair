import mongo from '#mongo'

export const trackEmbed = async (req, res, next) => {
  const urlPath = req.url.replace(/^\//, '')
  const [resourceType, resourceId, embedView] = urlPath.split(/[/?]/)
  if (resourceType === 'dataset' && resourceId) {
    const dataset = await mongo.db.collection('datasets').findOne({ id: resourceId }, { projection: { owner: 1, id: 1, title: 1 } })
    if (dataset) {
      const ownerHeader = { type: dataset.owner.type, id: dataset.owner.id }
      if (dataset.owner.department) ownerHeader.department = dataset.owner.department
      res.setHeader('x-resource', JSON.stringify({ type: 'embed', id: `${resourceType}-${resourceId}-${embedView}`, title: encodeURIComponent(`${dataset.title || dataset.id} / ${embedView}`) }))
      res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openEmbed', track: 'openApplication' }))
      res.setHeader('x-owner', JSON.stringify(ownerHeader))
    }
  }
  next()
}
