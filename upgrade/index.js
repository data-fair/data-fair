import path from 'node:path'
import semver from 'semver'
import fs from 'node:fs'
import debugModule from 'debug'
import pjson from '../package.json' with {type: 'json'}

const debug = debugModule('upgrade')

const scriptsRoot = path.join(import.meta.dirname, 'scripts')

// chose the proper scripts to execute, then run them
async function main (db, client) {
  const services = db.collection('services')
  const service = await services.findOne({ id: pjson.name })
  const version = service && service.version
  if (!version) {
    debug('No service version found in database, this is probably a fresh install')
  } else {
    debug(`Current service version from database : ${version}`)

    const scripts = await listScripts()
    for (const scriptDef of scripts) {
      if (semver.gte(scriptDef.version, version)) {
        for (const scriptName of scriptDef.names) {
          const script = (await import(path.join(scriptsRoot, scriptDef.version, scriptName))).default
          debug('Apply script %s/%s : %s', scriptDef.version, scriptName, script.description)
          await script.exec(db, require('debug')(`upgrade:${scriptDef.version}:${scriptName}`))
        }
      }
    }
  }

  const newService = { id: pjson.name, version: semver.coerce(pjson.version).version }
  debug(`Upgrade scripts are over, save current version number ${newService.version}`)
  await services.updateOne({ id: pjson.name }, { $set: newService }, { upsert: true })

  return { db, client }
}

// Walk the scripts directories
async function listScripts () {
  const dirs = fs.readdirSync(scriptsRoot).sort()
  return dirs.map(dir => {
    return {
      version: dir,
      names: fs.readdirSync(path.join(scriptsRoot, dir))
    }
  })
}

export default main
