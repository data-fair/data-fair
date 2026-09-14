// Semantic OpenAPI Service: list the actions declared by an OpenAPI document
// through the x-operationType / x-refersTo vendor extensions.
// Vendored from the unmaintained "soas" package (v0.5.1, 2022) which pinned an old
// vulnerable axios; only the action listing was used, the HTTP execution part is dropped.

export type SoasActionIO = {
  name: string
  description?: string
  in?: string
  required?: boolean
}

export type SoasAction = {
  id: string
  operation: { path: string, method: string }
  input: Record<string, SoasActionIO>
  inputCollection: boolean
  inputBodyTypes?: string[]
  output: Record<string, SoasActionIO>
  outputCollection: boolean
  outputBodyTypes?: string[]
  outputSchema?: any
  summary?: string
  type: string
  canUse: boolean
}

export const listActions = (apiDoc: any): SoasAction[] => {
  const endPoints: { method: string, path: string, operation: any }[] = []
  for (const path of Object.keys(apiDoc.paths || {})) {
    for (const method of Object.keys(apiDoc.paths[path])) {
      endPoints.push({ method, path, operation: apiDoc.paths[path][method] })
    }
  }

  const actions: SoasAction[] = []
  for (const endPoint of endPoints) {
    const operation = endPoint.operation
    if (!operation['x-operationType']) continue
    const input: Record<string, SoasActionIO> = {}
    const output: Record<string, SoasActionIO> = {}
    for (const p of (operation.parameters || []).filter((p: any) => p['x-refersTo'])) {
      input[p['x-refersTo']] = { name: p.name, description: p.description, in: p.in, required: p.required }
    }

    let canUse = true
    let inputCollection = false
    let inputBodyTypes: string[] | undefined
    if (operation.requestBody) {
      let properties: any
      const content = operation.requestBody.content
      inputBodyTypes = Object.keys(content).sort().reverse() // csv, ndjson, json priority order
      if (content?.['application/x-ndjson']?.schema) {
        inputCollection = true
        properties = content['application/x-ndjson'].schema.properties
      } else if (content?.['application/json']?.schema) {
        // for now we only handle collections in arrays
        if (content['application/json'].schema.type === 'array') {
          inputCollection = true
          properties = content['application/json'].schema.items.properties
        } else {
          properties = content['application/json'].schema.properties
        }
      } else if (operation.requestBody.required) {
        // the body is required but we don't know how to fill it
        canUse = false
      }
      if (properties) {
        for (const p of Object.keys(properties).filter(p => properties[p]['x-refersTo'])) {
          const prop = properties[p]
          // name = path in object, for the moment we only handle 1 level
          input[prop['x-refersTo']] = { name: p, description: prop.description, in: 'body', required: operation.requestBody.required && prop.required }
        }
      }
    }

    let outputCollection = false
    let outputBodyTypes: string[] | undefined
    let outputSchema: any
    // we only handle the 200 response
    if (operation.responses?.[200]) {
      let properties: any
      const content = operation.responses[200].content
      outputBodyTypes = Object.keys(content).sort().reverse() // csv, ndjson, json priority order
      if (content?.['application/x-ndjson']?.schema) {
        outputSchema = content['application/x-ndjson'].schema
        outputCollection = true
        properties = outputSchema.properties
      } else if (content?.['application/json']?.schema) {
        outputSchema = content['application/json'].schema
        if (outputSchema.type === 'array') {
          outputCollection = true
          properties = outputSchema.items.properties
        } else {
          properties = outputSchema.properties
        }
      }
      if (properties) {
        for (const p of Object.keys(properties).filter(p => properties[p]['x-refersTo'])) {
          const prop = properties[p]
          output[prop['x-refersTo']] = { name: p, description: prop.description, required: prop.required }
        }
      }
    }

    actions.push({
      id: operation.operationId || (endPoint.method + endPoint.path),
      operation: { path: endPoint.path, method: endPoint.method },
      input,
      inputCollection,
      inputBodyTypes,
      output,
      outputCollection,
      outputBodyTypes,
      outputSchema,
      summary: operation.summary,
      type: operation['x-operationType'],
      canUse
    })
  }

  // soas keyed actions by id in an object, so a duplicated id kept only the last one
  const byId: Record<string, SoasAction> = {}
  for (const a of actions) byId[a.id] = a
  return Object.values(byId)
}
