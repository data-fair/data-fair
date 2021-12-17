// this upgrade script is only relevant for Koumoul's environment, no impact for others

exports.description = 'Base applications have some i18n attributes now'

exports.exec = async (db, debug) => {
  for await (const baseApp of db.collection('base-applications').find({})) {
    if (typeof baseApp.meta.title === 'string') {
      await db.collection('base-applications').updateOne({ _id: baseApp._id }, {
        $set: {
          'meta.title': { fr: baseApp.meta.title },
          'meta.description': { fr: baseApp.meta.description },
        },
      })
    }

    if (typeof baseApp.title === 'string') {
      await db.collection('base-applications').updateOne({ _id: baseApp._id }, {
        $set: {
          title: { fr: baseApp.title },
          description: { fr: baseApp.description },
        },
      })
    }
  }
}
