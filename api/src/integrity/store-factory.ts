// App-only: builds the singleton from config. NEVER imported by tests (it imports #config).
import config from '#config'
import { IntegrityStore, type IntegrityS3Options } from './store.ts'

let _store: IntegrityStore | undefined
export const integrityStore = (): IntegrityStore => {
  if (!config.integrity?.active) throw new Error('integrity capability is not active (config.integrity.active=false)')
  // when active, the config schema guarantees a fully-populated s3 block (endpoint/bucket/credentials)
  if (!_store) _store = new IntegrityStore(config.integrity.s3 as IntegrityS3Options)
  return _store
}
