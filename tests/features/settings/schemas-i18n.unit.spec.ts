import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const typesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../api/types')

// json-layout resolves an override as value[locale] ?? value.en ?? base: an override without
// fr shows its en value to a French user instead of the French base keyword
const overridesWithoutFr = (node: unknown, at: string, found: string[]) => {
  if (!node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('x-i18n-') && value && typeof value === 'object' && !('fr' in value)) found.push(`${at}.${key}`)
    else overridesWithoutFr(value, `${at}.${key}`, found)
  }
}

test.describe('x-i18n overrides of the api schemas', () => {
  for (const name of readdirSync(typesDir)) {
    const file = path.join(typesDir, name, 'schema.js')
    if (!existsSync(file)) continue
    test(`${name}: every override has a fr value`, async () => {
      const schema = (await import(file)).default
      const found: string[] = []
      overridesWithoutFr(schema, name, found)
      assert.deepEqual(found, [])
    })
  }
})
