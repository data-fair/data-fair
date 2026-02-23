import type { ApiConfig } from '../config/type/index.ts'
import { assertValid } from '../config/type/index.ts'
import config from 'config'

export type { ApiConfig } from '../config/type/index.ts'

const apiConfig = process.env.NODE_ENV === 'test'
  // @ts-ignore
  ? config.util.loadFileConfigs(process.env.NODE_CONFIG_DIR, { skipConfigSources: true })
  : config

assertValid(apiConfig, { lang: 'en', name: 'config', internal: true })

export default apiConfig as ApiConfig
