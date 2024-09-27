exports.description = 'Remove null values in remoteFile.etag and remoteFile.lastModified.'

exports.exec = async (db, debug) => {
  const lastModifiedRes = await db.collection('datasets').updateMany(
    { 'remoteFile.lastModified': { $exists: true, $eq: null } },
    { $unset: { 'remoteFile.lastModified': 1 } }
  )
  debug('removed null remoteFile.lastModified', lastModifiedRes)

  const etagRes = await db.collection('datasets').updateMany(
    { 'remoteFile.etag': { $exists: true, $eq: null } },
    { $unset: { 'remoteFile.etag': 1 } }
  )
  debug('removed null remoteFile.etag', etagRes)
}
