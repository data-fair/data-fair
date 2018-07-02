// Add 'datasets' and 'remoteServices' arrays in application.configuration
// Based on previous, more loose convention

const dbUtils = require('../../server/utils/db')

function ensureDataset(conf, oldKey, newKey) {
  conf.datasets = conf.datasets || []
  if (conf[oldKey] && !conf.datasets.find(d => d.href === conf[oldKey])) {
    conf.datasets.push({href: conf[oldKey], key: newKey})
  }
}

function ensureRemoteService(conf, oldKey, newKey) {
  conf.remoteServices = conf.remoteServices || []
  if (conf[oldKey] && !conf.remoteServices.find(d => d.href === conf[oldKey])) {
    conf.remoteServices.push({href: conf[oldKey], key: newKey})
  }
}

async function main() {
  const {db} = await dbUtils.init()

  const appCursor = db.collection('applications').find({})
  while (await appCursor.hasNext()) {
    const app = await appCursor.next()
    const conf = app.configuration = app.configuration || {}
    ensureDataset(conf, 'datasetUrl', 'dataset')
    ensureDataset(conf, 'networksDatasetUrl', 'networks')
    ensureDataset(conf, 'networksMembersDatasetUrl', 'networks-members')
    ensureRemoteService(conf, 'geocoderUrl', 'geocoder')
    ensureRemoteService(conf, 'sireneUrl', 'sirene')
    ensureRemoteService(conf, 'tileserverUrl', 'tileserver')

    await db.collection('applications').updateOne(
      {_id: app._id},
      {$set: {
        'configuration.datasets': conf.datasets,
        'configuration.remoteServices': conf.remoteServices
      }}
    )
  }
}

main().then(() => process.exit())
