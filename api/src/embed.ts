import type { Request, Response, NextFunction } from 'express'
import { reqPublicationSite } from './misc/utils/publication-sites.ts'
import mongo from '#mongo'

export const trackEmbed = async (req: Request, res: Response, next: NextFunction) => {
  const urlPath = req.url.replace(/^\//, '')
  const [resourceType, resourceId, embedView] = urlPath.split(/[/?]/)
  if (resourceType === 'dataset' && resourceId) {
    const dataset = await mongo.datasets.findOne({ id: resourceId }, { projection: { owner: 1, id: 1, title: 1 } })
    if (dataset) {
      const ownerHeader: { type: string, id: string, department?: string } = { type: dataset.owner.type, id: dataset.owner.id }
      if (dataset.owner.department) ownerHeader.department = dataset.owner.department
      res.setHeader('x-resource', JSON.stringify({ type: 'embed', id: `${resourceType}-${resourceId}-${embedView}`, title: encodeURIComponent(`${dataset.title || dataset.id} / ${embedView}`) }))
      res.setHeader('x-operation', JSON.stringify({ class: 'read', id: 'openEmbed', track: 'openApplication' }))
      res.setHeader('x-client', req.get('x-client') || (reqPublicationSite(req) ? 'portal' : 'embed'))
      res.setHeader('x-owner', JSON.stringify(ownerHeader))
    }
  }
  next()
}
