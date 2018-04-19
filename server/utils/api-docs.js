// WARNING: this util is used both in UI and server
exports.operations = (apiDoc) => {
  if (!apiDoc) return []
  return (apiDoc && [].concat(...Object.keys(apiDoc.paths).map(path => Object.keys(apiDoc.paths[path]).map(method => ({
    id: apiDoc.paths[path][method].operationId,
    title: apiDoc.paths[path][method].summary
  }))))) || []
}
