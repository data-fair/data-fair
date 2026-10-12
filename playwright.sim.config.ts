import 'dotenv/config'
import { defineSimConfig } from '@data-fair/lib-agents-sim'

export default defineSimConfig({
  baseURL: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`,
  // Headed by default: simulations are always started by a maintainer, and watching
  // a simulated person use the product is most of the value. SIM_HEADLESS=1 opts out.
  headless: !!process.env.SIM_HEADLESS
})
