import * as findUtils from '../misc/utils/find.js'
import { prepareMarkdownContent } from '../misc/utils/markdown.js'
import soasLoader from 'soas'
import * as ajv from '../misc/utils/ajv.ts'
import { type SessionState } from '@data-fair/lib-express'
import { type RemoteService } from '#types'

export const validateOpenApi = ajv.compile('openapi-3.1')

export const initNew = (body) => {
  const service = { ...body }
  if (service.apiDoc) {
    if (service.apiDoc.info) {
      service.title = service.title || service.apiDoc.info.title
      service.description = service.apiDoc.info.description
    }
    service.actions = computeActions(service.apiDoc)
  }
  return service
}

// TODO: explain ? simplify ? hard to understand piece of code
export const computeActions = (apiDoc) => {
  const actions = soasLoader(apiDoc).actions()
  for (const a of actions) {
    a.input = Object.keys(a.input).map(concept => ({ concept, ...a.input[concept] }))
    const outputSchema = a.outputSchema
    if (outputSchema) {
      const outputProps = a.outputSchema.properties || (a.outputSchema.items && a.outputSchema.items.properties) || {}
      a.output = Object.keys(outputProps).map(prop => ({ name: prop, concept: outputProps[prop]['x-refersTo'], ...outputProps[prop] }))
    } else {
      a.output = []
    }
  }
  return actions
}

export const clean = (remoteService: RemoteService, sessionState: SessionState, html) => {
  delete remoteService._id
  if (remoteService.apiKey && remoteService.apiKey.value) remoteService.apiKey.value = '**********'
  if (!sessionState.user || !sessionState.user.adminMode) delete remoteService.privateAccess
  if (remoteService.description) {
    remoteService.description = prepareMarkdownContent(remoteService.description, html, null, `remoteService:${remoteService.id}`, remoteService.updatedAt)
  }
  findUtils.setResourceLinks(remoteService, 'remote-service')
  return remoteService
}
