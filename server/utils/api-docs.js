// TODO: this could be processed from actual api doc ?
exports.operationsClasses = {
  datasets: {
    list: ['list'],
    read: ['readDescription', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getValues', 'getMetricAgg', 'getWordsAgg', 'downloadOriginalData', 'downloadFullData', 'readApiDoc', 'realtime-transactions', 'readLine', 'readLineRevisions'],
    readAdvanced: ['readJournal', 'realtime-journal', 'realtime-extend-progress'],
    write: ['writeDescription', 'writeData', 'createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine'],
    admin: ['delete', 'getPermissions', 'setPermissions'],
  },
  applications: {
    list: ['list'],
    read: ['readDescription', 'readConfig', 'readApiDoc', 'readBaseApp'],
    readAdvanced: ['readJournal', 'realtime-draft-error'],
    write: ['writeDescription', 'writeConfig'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'getKeys', 'setKeys'],
  },
  catalogs: {
    list: ['list'],
    read: ['readDescription', 'readApiDoc'],
    write: ['writeDescription'],
    admin: ['delete', 'getPermissions', 'setPermissions'],
    use: ['readDatasets'],
  },
}

exports.userOperationsClasses = {
  datasets: ['list', 'read'],
  applications: ['list', 'read'],
}

exports.contribOperationsClasses = {
  datasets: ['post', 'list', 'read', 'readAdvanced', 'write'],
  applications: ['post', 'list', 'read', 'readAdvanced', 'write'],
  catalogs: ['list', 'read', 'use'],
}

// WARNING: this util is used both in UI and server
exports.operations = (apiDoc) => {
  if (!apiDoc) return []
  return (apiDoc && [].concat(...Object.keys(apiDoc.paths).map(path => Object.keys(apiDoc.paths[path]).map(method => ({
    id: apiDoc.paths[path][method].operationId,
    title: apiDoc.paths[path][method].summary,
  }))))) || []
}
