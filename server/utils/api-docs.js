// TODO: this could be processed from actual api doc ?
exports.operationsClasses = {
  datasets: {
    list: ['list'],
    read: ['readDescription', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getValues', 'getMetricAgg', 'getWordsAgg', 'downloadOriginalData', 'downloadFullData', 'readJournal', 'readApiDoc'],
    write: ['writeDescription', 'writeData'],
    admin: ['delete', 'getPermissions', 'setPermissions']
  },
  applications: {
    list: ['list'],
    read: ['readDescription', 'readConfig', 'readApiDoc', 'readJournal'],
    write: ['writeDescription', 'writeConfig'],
    admin: ['delete', 'getPermissions', 'setPermissions']
  },
  catalogs: {
    list: ['list'],
    read: ['readDescription'],
    write: ['writeDescription'],
    admin: ['delete', 'getPermissions', 'setPermissions'],
    use: []
  }
}

// WARNING: this util is used both in UI and server
exports.operations = (apiDoc) => {
  if (!apiDoc) return []
  return (apiDoc && [].concat(...Object.keys(apiDoc.paths).map(path => Object.keys(apiDoc.paths[path]).map(method => ({
    id: apiDoc.paths[path][method].operationId,
    title: apiDoc.paths[path][method].summary
  }))))) || []
}
