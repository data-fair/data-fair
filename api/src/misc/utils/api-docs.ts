import { type ResourceType } from '#types'

// TODO: this could be processed from actual api doc ?
export const operationsClasses: Record<ResourceType, Record<string, string[]>> = {
  datasets: {
    list: ['list'],
    read: ['readDescription', 'readSchema', 'readSafeSchema', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getValues', 'getMetricAgg', 'getSimpleMetricsAgg', 'getWordsAgg', 'getMinAgg', 'getMaxAgg', 'downloadOriginalData', 'downloadFullData', 'readApiDoc', 'realtime-transactions', 'readLine', 'readLineRevisions', 'readRevisions', 'bulkSearch', 'listDataFiles', 'downloadDataFile', 'downloadMetadataAttachment', 'downloadAttachment', 'getReadApiKey', 'readCompatODSRecords', 'readCompatODSExports'],
    readAdvanced: ['readJournal', 'realtime-journal', 'realtime-task-progress', 'readPrivateApiDoc'],
    write: ['writeDescription', 'writeDescriptionBreaking', 'writeData', 'createLine', 'updateLine', 'patchLine', 'bulkLines', 'deleteLine', 'deleteAllLines', 'validateDraft', 'cancelDraft', 'postMetadataAttachment', 'deleteMetadataAttachment', 'sendUserNotification', 'simulateExtension'],
    manageOwnLines: ['readOwnLines', 'readOwnLine', 'createOwnLine', 'updateOwnLine', 'patchOwnLine', 'bulkOwnLines', 'deleteOwnLine', 'readOwnLineRevisions', 'readOwnRevisions'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'changeOwner', 'writePublications', 'writePublicationSites', 'writeExports', 'setReadApiKey']
  },
  applications: {
    list: ['list'],
    read: ['readDescription', 'readConfig', 'readApiDoc', 'readBaseApp', 'readCapture', 'readPrint', 'downloadAttachment'],
    readAdvanced: ['readJournal', 'realtime-draft-error'],
    write: ['writeDescription', 'writeConfig', 'postAttachment', 'deleteAttachment'],
    admin: ['delete', 'getPermissions', 'setPermissions', 'getKeys', 'setKeys', 'writePublications', 'writePublicationSites']
  },
  catalogs: {
    list: ['list'],
    read: ['readDescription', 'readApiDoc'],
    write: ['writeDescription'],
    admin: ['delete', 'getPermissions', 'setPermissions'],
    use: ['readDatasets', 'harvestDataset', 'harvestDatasetResource']
  }
}

export const adminOperationsClasses: Record<ResourceType, string[]> = {
  datasets: ['manageMasterData'],
  catalogs: ['post'],
  applications: []
}

export const contribOperationsClasses: Record<ResourceType, string[]> = {
  datasets: ['post'],
  applications: ['post'],
  catalogs: ['list', 'read', 'use']
}

// WARNING: this util is used both in UI and server
export const operations = (apiDoc: any): { id: string, title: string }[] => {
  if (!apiDoc) return []
  // @ts-ignore
  return (apiDoc && [].concat(...Object.keys(apiDoc.paths).map(path => Object.keys(apiDoc.paths[path]).map(method => ({
    id: apiDoc.paths[path][method].operationId,
    title: apiDoc.paths[path][method].summary
  }))))) || []
}

export const classByOperation: Record<ResourceType, Record<string, string>> = {
  datasets: {},
  applications: {},
  catalogs: {}
}
for (const resourceType of Object.keys(operationsClasses) as ResourceType[]) {
  for (const classe of Object.keys(operationsClasses[resourceType])) {
    for (const operation of operationsClasses[resourceType][classe]) {
      classByOperation[resourceType][operation] = classe
    }
  }
}
