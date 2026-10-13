// Render dev/resources/users.json from its committed template.
//
// docker-compose mounts that file straight into simple-directory, which reads it verbatim: a fixture
// that names a URL (the autonomous-agent NHI's issuer) cannot write the host and port literally,
// because they are chosen per checkout by dev/init-env.sh. They are substituted here.
//
// Only the values passed in RENDER_VALUES are used, never the ambient environment: a shell that
// sourced a previous .env would otherwise render the previous port, and the NHI exchange would fail
// with simple-directory's uniform 401. Written to a temp file moved into place only once valid.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'

const values = JSON.parse(process.env.RENDER_VALUES ?? '{}')
let raw = readFileSync('dev/resources/users.template.json', 'utf8')
for (const [key, value] of Object.entries(values)) {
  raw = raw.replaceAll(`{${key}}`, String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"'))
}
const unresolved = raw.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)
if (unresolved) {
  console.error('unresolved placeholders in users.template.json:', [...new Set(unresolved)].join(', '))
  console.error('known values:', Object.keys(values).join(', '))
  process.exit(1)
}
JSON.parse(raw)
writeFileSync('dev/resources/users.json.tmp', raw)
renameSync('dev/resources/users.json.tmp', 'dev/resources/users.json')
