// this upgrade script is only relevant for Koumoul's environment, no impact for others

exports.description = 'Datasets href'

async function fixConfig (db, application, configKey) {
  if (application[configKey] &&
     application[configKey].datasets &&
     application[configKey].datasets
       .filter(d => !!d)
       .filter(d => d.href && d.href.includes('koumoul.com/s/data-fair')).length
  ) {
    application[configKey].datasets.filter(d => !!d).forEach(dataset => {
      if (dataset.href) dataset.href = dataset.href.replace('koumoul.com/s/data-fair', 'koumoul.com/data-fair')
    })
    await db.collection('applications').updateOne({ _id: application._id }, { $set: { [configKey]: application[configKey] } })
    return 1
  }
  return 0
}

exports.exec = async (db, debug) => {
  let nbConfig = 0
  let nbConfigDrafts = 0
  for await (const application of db.collection('applications').find({})) {
    nbConfig += await fixConfig(db, application, 'configuration')
    nbConfigDrafts += await fixConfig(db, application, 'configurationDraft')
  }
  debug(`updated ${nbConfig} configs and ${nbConfigDrafts} config drafts`)
}
