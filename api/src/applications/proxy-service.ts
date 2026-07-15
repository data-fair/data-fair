import mongo from '#mongo'

export const matchApplicationKey = async (application: any, applicationKeyId: string, ownerFilter: Record<string, any>): Promise<boolean> => {
  const applicationKey = await mongo.db.collection('applications-keys')
    .findOne({ 'keys.id': applicationKeyId, ...ownerFilter })
  if (applicationKey) {
    if (applicationKey._id === application.id) {
      return true
    } else {
      // ths application key can be matched to a parent application key (case of dashboards, etc)
      const isParentApplicationKey = await mongo.db.collection('applications')
        .countDocuments({ id: applicationKey._id, 'configuration.applications.id': application.id, ...ownerFilter })
      if (isParentApplicationKey) {
        return true
      }
    }
  }
  return false
}

export const getManifestBaseApp = (url: string) => {
  return mongo.baseApplications.findOne({ url }, { projection: { id: 1, meta: 1, artefactId: 1 } })
}

export const getProxyBaseAppAndLimits = (application: any, applicationUrl: string, accessFilter: any[]) => {
  const db = mongo.db
  return Promise.all([
    db.collection('limits').findOne({ type: application.owner.type, id: application.owner.id }),
    mongo.baseApplications.findOne({ url: applicationUrl, $or: accessFilter }, { projection: { id: 1, meta: 1, artefactId: 1 } })
  ])
}
