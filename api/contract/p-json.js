import { readFileSync } from 'node:fs'
import path from 'path'

export default JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8'))
