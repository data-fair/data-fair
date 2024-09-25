exports.description = 'Fix the results of a bug in status and errorStatus management'

exports.exec = async (db, debug) => {
  const res1 = await db.collection('datasets').updateMany(
    { status: 'resource.status' },
    { $set: { status: 'error' } }
  )
  debug('fixed dataset.status', res1)
  const res2 = await db.collection('datasets').updateMany(
    { 'draft.status': 'resource.status' },
    { $set: { 'draft.status': 'error' } }
  )
  debug('fixed dataset.draft.status', res2)

  const res3 = await db.collection('datasets').updateMany(
    { errorStatus: 'resource.status' },
    { $set: { errorStatus: 'indexed' } }
  )
  debug('fixed dataset.errorStatus', res3)
  const res4 = await db.collection('datasets').updateMany(
    { 'draft.errorStatus': 'resource.status' },
    { $set: { 'draft.errorStatus': 'indexed' } }
  )
  debug('fixed dataset.draft.errorStatus', res4)
}
