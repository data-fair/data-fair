exports.description = 'Remove wrongly assigned draftReason on rest datasets.'

exports.exec = async (db, debug) => {
  const removedDraftReasonRes = await db.collection('datasets').updateMany(
    { draftReason: { $exists: true }, isRest: true },
    { $unset: { draftReason: 1 } }
  )
  debug('removed draftReason on rest datasets', removedDraftReasonRes)
}
