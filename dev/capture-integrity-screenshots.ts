// Regenerate the screenshots of docs/presentation-integrite-fr/img/ from the dev fixtures.
// Prerequisites: dev env up, `npm run dev-fixtures` seeded (fixtures-integrite-*).
// Run: node --experimental-strip-types dev/capture-integrity-screenshots.ts
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env', quiet: true })

const baseUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
const outDir = 'docs/presentation-integrite-fr/img'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1100, height: 1400 }, locale: 'fr-FR' })
const page = await context.newPage()

// superadmin login with admin mode (the integrity write actions render in admin mode only)
const firstTarget = `${baseUrl}/data-fair/dataset/fixtures-integrite-ok`
await page.goto(`${baseUrl}/simple-directory/login?redirect=${encodeURIComponent(firstTarget)}&adminMode=true`)
await page.locator('input[name=email]').fill('test_superadmin@test.com')
await page.locator('input[name=password]').fill('passwd')
await page.getByRole('button', { name: 'Se connecter' }).click()
await page.waitForURL('**/data-fair/**', { timeout: 20000 })

const captureIntegrityTab = async (datasetId: string, filename: string) => {
  await page.goto(`${baseUrl}/data-fair/dataset/${datasetId}`)
  await page.getByRole('tab', { name: 'Intégrité' }).click()
  await page.waitForSelector('text=Historique des révisions', { timeout: 20000 })
  await page.waitForTimeout(2000) // history table + verdict alerts settle
  // several nested v-windows keep an --active item in the DOM: target the one that actually
  // holds the integrity panel (its history table heading)
  const panel = page.locator('.v-window-item--active').filter({ hasText: 'Historique des révisions' }).last()
  await panel.screenshot({ path: `${outDir}/${filename}` })
  console.log('captured', filename)
}

await captureIntegrityTab('fixtures-integrite-ok', 'panneau-integrite-ok.png')
await captureIntegrityTab('fixtures-integrite-breach', 'panneau-integrite-breche.png')
await captureIntegrityTab('fixtures-integrite-lignes', 'panneau-integrite-lignes.png')

await browser.close()
console.log('done')
