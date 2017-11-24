// TODO add ensureIndex instructions to init logic.

const config = require('config')
const mongoClient = require('mongodb').MongoClient

// Index creations are non blocking for faster startup.
async function ensureIndex(db, collection, key, options) {
  try {
    await db.collection(collection).createIndex(key, options || {})
  } catch (error) {
    console.error('Init mongodb index creation failure for', collection, key, error)
  }
}

exports.init = function(callback) {
  mongoClient.connect(config.mongoUrl, {
    autoReconnect: true,
    bufferMaxEntries: -1
  }, function(err, db) {
    if (err) return callback(err)

    Promise.all([
      // accounts indexes
      ensureIndex(db, 'datasets', {
        'id': 1
      }, {
        unique: true
      }),
      ensureIndex(db, 'datasets', {
        'title': 'text',
        'description': 'text'
      }, {
        name: 'fulltext'
      })
    ]).then(result => {
      callback(null, db)
    })
  })
}
