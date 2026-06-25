// App-only: builds the singleton from config. NEVER imported by tests (it imports #config).
import config from '#config'
import { IntegrityStore } from './store.ts'

let _store: IntegrityStore | undefined
export const integrityStore = (): IntegrityStore => {
  if (!config.integrity?.active) throw new Error('integrity capability is not active (config.integrity.active=false)')
  if (!_store) _store = new IntegrityStore(config.integrity.s3)
  return _store
}
