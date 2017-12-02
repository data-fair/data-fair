// Semantic Open API Specification library
// This may moved to an external repo
// Holds utilisty function to manipulate an API

let api

const load = (jsonApi) => {
  api = jsonApi
}

const endPoints = () => {
  return [].concat(...Object.keys(api.paths).map(path => Object.keys(api.paths[path]).map(method => ({
    method: method,
    path: path,
    operation: api.paths[path][method]
  }))))
}

const operations = () => {
  return endPoints().filter(endPoint => endPoint.operation['x-operationType']).map(endPoint => {
    const operation = endPoint.operation
    const input = {}
    const output = {}
    operation.parameters = operation.parameters || [] // On 2 lines for linter ...
    operation.parameters.filter(p => p['x-refersTo']).forEach(p => {
      input[p['x-refersTo']] = input[p['x-refersTo']] || []
      input[p['x-refersTo']].push({
        name: p.name,
        description: p.description,
        in: p.in,
        required: p.required
      })
    })
    let canUse = true
    let inputCollection = false
    if (operation.requestBody) {
      const content = operation.requestBody.content
      if (content && content['application/json'] && content['application/json'].schema) {
        // We will include a test on content['application/json'].schema['x-collectionOn'] later.
        // For now we only handle collections in arrays
        let properties
        if (content['application/json'].schema.type === 'array') {
          inputCollection = true
          properties = content['application/json'].schema.items.properties
        } else {
          properties = content['application/json'].schema.properties
        }
        Object.keys(properties).filter(p => properties[p]['x-refersTo']).forEach(p => {
          const prop = properties[p]
          input[prop['x-refersTo']] = input[prop['x-refersTo']] || []
          input[prop['x-refersTo']].push({
            name: p, // path in object, for the moment we only handle 1 level
            description: prop.description,
            in: 'body',
            required: operation.requestBody.required && prop.required
          })
        })
      } else if (operation.requestBody.required) {
        // The body is required but we don't know how to fill it
        canUse = false
      }
    }
    let outputCollection = false
    // We will handle other codes later
    if (operation.responses[200]) {
      const content = operation.responses[200].content
      if (content && content['application/json'] && content['application/json'].schema) {
        // We will include a test on content['application/json'].schema['x-collectionOn'] later.
        // For now we only handle collections in arrays
        let properties
        if (content['application/json'].schema.type === 'array') {
          outputCollection = true
          properties = content['application/json'].schema.items.properties
        } else {
          properties = content['application/json'].schema.properties
        }
        Object.keys(properties).filter(p => properties[p]['x-refersTo']).forEach(p => {
          const prop = properties[p]
          output[prop['x-refersTo']] = output[prop['x-refersTo']] || []
          output[prop['x-refersTo']].push({
            name: p, // path in object, for the moment we only handle 1 level
            description: prop.description,
            required: prop.required
          })
        })
      }
    }
    return {
      input,
      inputCollection,
      output,
      outputCollection,
      summary: operation.summary,
      operation: operation['x-operationType'],
      canUse
    }
  })
}

module.exports = {
  load,
  endPoints,
  operations
}
