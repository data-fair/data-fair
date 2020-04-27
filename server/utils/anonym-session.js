// Manage anonymous sessions for applications' users
// Distinct from authentication's session

const config = require('config')
const crypto = require('crypto')
const expressSession = require('express-session')
const MongoStore = require('connect-mongo')(expressSession)

exports.init = async (client, db) => {
  const store = new MongoStore({
    client,
    stringify: false,
    collection: 'sessions',
    ttl: 60 * 60 // = 1h
  })

  try {
    await db.collection('secrets').insertOne({ _id: 'anonym-session', secret: crypto.randomBytes(50).toString('hex') })
  } catch (err) {
    if (err.code !== 11000) throw err
  }
  const secret = (await db.collection('secrets').findOne({ _id: 'anonym-session' })).secret
  return expressSession({
    store,
    secret,
    name: 'df_session_id',
    resave: false,
    saveUninitialized: true,
    cookie: {
      // if we set this option cookies are not sent by older versions of firefox from inside iframes in an outside domain
      // sameSite: 'lax',
      secure: config.publicUrl.startsWith('https')
    }
  })
}
