exports.description = 'Drop an index with deprecated unique constraint.'

exports.exec = async (db, debug) => {
  try {
    await db.collection('settings').dropIndex('type_1_id_1')
  } catch (err) {
  // nothing to do
  }
}
