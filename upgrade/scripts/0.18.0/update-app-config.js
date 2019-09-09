exports.description = 'Add \'datasets\' and \'remoteServices\' arrays in application.configuration based on previous, more loose conventions'

exports.exec = async (db, debug) => {
  const appCursor = db.collection('applications').find({})
  while (await appCursor.hasNext()) {
    const app = await appCursor.next()
    const conf = app.configuration = app.configuration || {}
    ensureDataset(conf, 'datasetUrl', 'dataset', debug)
    ensureDataset(conf, 'networksDatasetUrl', 'networks', debug)
    ensureDataset(conf, 'networksMembersDatasetUrl', 'networks-members', debug)
    ensureRemoteService(conf, 'geocoderUrl', 'geocoder', debug)
    ensureRemoteService(conf, 'sireneUrl', 'sirene', debug)
    ensureRemoteService(conf, 'tileserverUrl', 'tileserver', debug)

    if (conf.datasets.length || conf.remoteServices.length) {
      await db.collection('applications').updateOne(
        { _id: app._id },
        {
          $set: {
            'configuration.datasets': conf.datasets,
            'configuration.remoteServices': conf.remoteServices
          }
        }
      )
    }
  }
}

function ensureDataset(conf, oldKey, newKey, debug) {
  conf.datasets = conf.datasets || []
  if (conf[oldKey] && !conf.datasets.find(d => d.href === conf[oldKey])) {
    conf.datasets.push({ href: conf[oldKey], key: newKey })
    debug(`Configuration ${conf.id} : ${oldKey} -> datasets.${newKey} (${conf[oldKey]})`)
  }
}

function ensureRemoteService(conf, oldKey, newKey, debug) {
  conf.remoteServices = conf.remoteServices || []
  if (conf[oldKey] && !conf.remoteServices.find(d => d.href === conf[oldKey])) {
    conf.remoteServices.push({ href: conf[oldKey], key: newKey })
    debug(`Configuration ${conf.id} : ${oldKey} -> remoteServices.${newKey} (${conf[oldKey]})`)
  }
}
