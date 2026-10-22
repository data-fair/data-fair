import { test as setup, expect } from './fixtures/login.ts'
import { axiosAuth, clean } from './support/axios.ts'
import { sendDataset } from './support/workers.ts'

/**
 * The dev UI transforms each route on its first hit. Without this project the first e2e tests of a
 * cold run pay for it inside their 10 s navigation timeout. It visits the routes most e2e specs use
 * once, with a long timeout, and records how long each one took in the test annotations.
 */
setup('warm up the dev UI routes', async ({ page, goToWithAuth }, testInfo) => {
  let last = Date.now()
  const stamp = (step: string) => {
    testInfo.annotations.push({ type: 'warmup', description: `${step}: ${Date.now() - last} ms` })
    last = Date.now()
  }

  await clean()
  const dataset = await sendDataset('datasets/dataset1.csv', await axiosAuth('test_user1@test.com'))
  stamp('seed a dataset')

  await goToWithAuth('/data-fair/datasets', 'test_user1')
  await expect(page.locator('.v-container .v-card').first()).toBeVisible()
  stamp('datasets list')

  await goToWithAuth(`/data-fair/dataset/${dataset.id}`, 'test_user1')
  await expect(page.locator('#structure')).toBeVisible()
  stamp('dataset page')

  await goToWithAuth(`/data-fair/dataset/${dataset.id}/table`, 'test_user1')
  await expect(page.locator('.dataset-table')).toBeAttached()
  stamp('dataset table')

  await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
  await expect(page.locator('.dataset-table')).toBeAttached()
  stamp('embedded dataset table')

  await goToWithAuth('/data-fair/new-dataset', 'test_user1')
  await expect(page.locator('.v-card-title', { hasText: 'Virtuel' })).toBeVisible()
  stamp('new dataset')

  await goToWithAuth('/data-fair/applications', 'test_user1')
  await expect(page.locator('main')).toBeVisible()
  stamp('applications list')

  await clean()
})
