// TODO: this could be processed from actual api doc ?
exports.operationsClasses = {
  datasets: {
    list: ['list'],
    read: ['readDescription', 'readSchema', 'readSafeSchema', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getValues', 'getMetricAgg', 'getSimpleMetricsAgg', 'getWordsAgg', 'getMinAgg', 'getMaxAgg', 'downloadOriginalData', 'downloadFullData', 'readApiDoc', 'realtime-transactions', 'readLine', 'readLineRevisions', 'readRevisions', 'bulkSearch', 'listDataFiles', 'downloadDataFile', 'downloadMetadataAttachment', 'downloadAttachment'],
    readAdvanced: ['readJournal', 'realtime-journal', 'realtime-task-progress', 'readPrivateApiDoc'],
    write: ['writeDescription', 'writeDescriptionBreaking', 'writeData', 'createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines', 'validateDraft', 'cancelDraft', 'postMetadataAttachment', 'deleteMetadataAttachment', 'sendUserNotification'],
    manageOwnLines: ['readOwnLines', 'readOwnLine', 'createOwnLine', 'updateOwnLine', 'patchOwnLine', 'bulkOwnLines', 'deleteOwnLine', 'readOwnLineRevisions', 'readOwnRevisions'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'changeOwner', 'writePublications', 'writePublicationSites', 'writeExports']
  },
  applications: {
    list: ['list'],
    read: ['readDescription', 'readConfig', 'readApiDoc', 'readBaseApp'],
    readAdvanced: ['readJournal', 'realtime-draft-error'],
    write: ['writeDescription', 'writeConfig'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'getKeys', 'setKeys', 'writePublications', 'writePublicationSites']
  },
  catalogs: {
    list: ['list'],
    read: ['readDescription', 'readApiDoc'],
    write: ['writeDescription'],
    admin: ['delete', 'getPermissions', 'setPermissions'],
    use: ['readDatasets', 'harvestDataset']
  }
}

exports.contribOperationsClasses = {
  datasets: ['post'],
  applications: ['post'],
  catalogs: ['list', 'read', 'use']
}

// WARNING: this util is used both in UI and server
exports.operations = (apiDoc) => {
  if (!apiDoc) return []
  return (apiDoc && [].concat(...Object.keys(apiDoc.paths).map(path => Object.keys(apiDoc.paths[path]).map(method => ({
    id: apiDoc.paths[path][method].operationId,
    title: apiDoc.paths[path][method].summary
  }))))) || []
}

exports.classByOperation = {}
for (const resourceType of Object.keys(exports.operationsClasses)) {
  exports.classByOperation[resourceType] = {}
  for (const classe of Object.keys(exports.operationsClasses[resourceType])) {
    for (const operation of exports.operationsClasses[resourceType][classe]) {
      exports.classByOperation[resourceType][operation] = classe
    }
  }
}
