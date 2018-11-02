const dbUtils = require('../server/utils/db')

async function main() {
  const { db } = await dbUtils.init()
  await db.collection('datasets').updateMany({ status: 'error' }, { $set: { status: 'schematized' } })
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
