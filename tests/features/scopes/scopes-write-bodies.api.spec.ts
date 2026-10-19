import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { nhiSession } from '../../support/nhi.ts'

// the keys of a write body that need more than the route's own operation (read API key, master
// data, publications) are checked the same way on every write route: a write tier token
// cannot set them through POST/PUT /datasets/:id, dataset creation or an application PUT when
// PATCH refuses them. Resources are created by an unrestricted admin of test_org1.

const orgAdmin = await axiosAuth('test_user1@test.com', 'test_org1')

const status = async (p: Promise<any>) => {
  try {
    return (await p).status
  } catch (err: any) {
    if (err.status) return err.status
    throw err
  }
}

const createDataset = async (id: string) => {
  await orgAdmin.put(`/api/v1/datasets/${id}`, { isRest: true, title: 'Write bodies', schema: [{ key: 'a', type: 'string' }] })
}

const readApiKey = { readApiKey: { active: true, interval: 'P1W' } }
const masterData = { masterData: { standardSchema: { active: true } } }

// a publication site that is not a staging site: publishing on it needs writePublicationSites
const site = { type: 'data-fair-portals', id: 'scope-portal', url: 'http://scope-portal.example.com', title: 'Scope portal' }
const siteKey = `${site.type}:${site.id}`

test.describe('admin tier keys of the write bodies', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('datasets:write cannot set admin tier keys through POST/PUT /datasets/:id', async () => {
    await createDataset('scope-wb-write')
    const ax = (await nhiSession('datasets:write')).bearerAx
    assert.equal(await status(ax.post('/api/v1/datasets/scope-wb-write', readApiKey)), 403)
    assert.equal(await status(ax.put('/api/v1/datasets/scope-wb-write', readApiKey)), 403)
    assert.equal(await status(ax.post('/api/v1/datasets/scope-wb-write', masterData)), 403)
    // PATCH refuses them as before
    assert.equal(await status(ax.patch('/api/v1/datasets/scope-wb-write', readApiKey)), 403)
    assert.equal(await status(ax.patch('/api/v1/datasets/scope-wb-write', masterData)), 403)
    // the write tier still writes the rest
    assert.equal(await status(ax.post('/api/v1/datasets/scope-wb-write', { title: 'Renamed' })), 200)
    const ds = (await orgAdmin.get('/api/v1/datasets/scope-wb-write')).data
    assert.equal(ds.title, 'Renamed')
    assert.ok(!ds.readApiKey?.active)
    assert.ok(!ds.masterData?.standardSchema?.active)
  })

  test('datasets:write cannot create a dataset with admin tier keys', async () => {
    const ax = (await nhiSession('datasets:write')).bearerAx
    const base = { isRest: true, title: 'Created', schema: [{ key: 'a', type: 'string' }] }
    assert.equal(await status(ax.post('/api/v1/datasets', { ...base, ...readApiKey })), 403)
    assert.equal(await status(ax.post('/api/v1/datasets', { ...base, ...masterData })), 403)
    assert.equal(await status(ax.put('/api/v1/datasets/scope-wb-created', { ...base, ...readApiKey })), 403)
    assert.ok(!(await orgAdmin.get('/api/v1/datasets', { params: { select: 'title' } })).data.results.some((d: any) => d.title === 'Created'))
    assert.equal(await status(ax.post('/api/v1/datasets', base)), 201)
  })

  test('datasets:admin sets the admin tier keys through every write route', async () => {
    await createDataset('scope-wb-admin')
    const ax = (await nhiSession('datasets:admin')).bearerAx
    assert.equal(await status(ax.post('/api/v1/datasets/scope-wb-admin', readApiKey)), 200)
    assert.equal(await status(ax.post('/api/v1/datasets/scope-wb-admin', masterData)), 200)
    assert.equal(await status(ax.patch('/api/v1/datasets/scope-wb-admin', { readApiKey: { active: false } })), 200)
    assert.equal(await status(ax.put('/api/v1/datasets/scope-wb-admin', readApiKey)), 200)
    const ds = (await orgAdmin.get('/api/v1/datasets/scope-wb-admin')).data
    assert.ok(ds.readApiKey?.active)
    assert.ok(ds.masterData?.standardSchema?.active)
    assert.equal(await status(ax.post('/api/v1/datasets', { isRest: true, title: 'Created by admin', schema: [], ...readApiKey })), 201)
  })

  test('applications:write cannot publish through PUT /applications/:id', async () => {
    await orgAdmin.post('/api/v1/settings/organization/test_org1/publication-sites', site)
    const app = (await orgAdmin.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Scope app' })).data
    const ax = (await nhiSession('applications:write')).bearerAx
    assert.equal(await status(ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: [siteKey] })), 403)
    assert.equal(await status(ax.put(`/api/v1/applications/${app.id}`, { url: app.url, title: app.title, publicationSites: [siteKey] })), 403)
    assert.equal(await status(ax.put(`/api/v1/applications/${app.id}`, { url: app.url, title: app.title, publications: [{ catalog: 'c1', status: 'waiting' }] })), 403)
    assert.deepEqual((await orgAdmin.get(`/api/v1/applications/${app.id}`)).data.publicationSites ?? [], [])
    // a replacement that does not touch the publications is still a write tier operation
    assert.equal(await status(ax.put(`/api/v1/applications/${app.id}`, { url: app.url, title: 'Renamed' })), 200)
  })

  test('applications:admin publishes through PUT /applications/:id', async () => {
    await orgAdmin.post('/api/v1/settings/organization/test_org1/publication-sites', site)
    const app = (await orgAdmin.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Scope app' })).data
    const ax = (await nhiSession('applications:admin')).bearerAx
    assert.equal(await status(ax.put(`/api/v1/applications/${app.id}`, { url: app.url, title: app.title, publicationSites: [siteKey] })), 200)
    assert.deepEqual((await orgAdmin.get(`/api/v1/applications/${app.id}`)).data.publicationSites, [siteKey])
  })
})

test.describe('application creation applies the publication checks', () => {
  test.beforeEach(async () => { await clean() })

  const stagingSite = { type: 'data-fair-portals', id: 'scope-staging', url: 'http://scope-staging.example.com', title: 'Scope staging', settings: { staging: true } }
  const stagingKey = `${stagingSite.type}:${stagingSite.id}`
  const base = () => ({ url: mockAppUrl('monapp1'), title: 'Created app' })
  const countCreated = async () => (await orgAdmin.get('/api/v1/applications', { params: { select: 'title' } })).data.results.filter((a: any) => a.title === 'Created app').length

  test('applications:write cannot create an application with publications', async () => {
    await orgAdmin.post('/api/v1/settings/organization/test_org1/publication-sites', site)
    await orgAdmin.post('/api/v1/settings/organization/test_org1/publication-sites', stagingSite)
    const ax = (await nhiSession('applications:write')).bearerAx
    assert.equal(await status(ax.post('/api/v1/applications', { ...base(), publicationSites: [siteKey] })), 403)
    assert.equal(await status(ax.put('/api/v1/applications/scope-created', { ...base(), publicationSites: [siteKey] })), 403)
    assert.equal(await status(ax.post('/api/v1/applications', { ...base(), publications: [{ catalog: 'c1', status: 'waiting' }] })), 403)
    assert.equal(await status(ax.put('/api/v1/applications/scope-created', { ...base(), publications: [{ catalog: 'c1', status: 'waiting' }] })), 403)
    assert.equal(await countCreated(), 0)
    assert.equal(await status(ax.post('/api/v1/applications', { ...base(), publicationSites: [stagingKey] })), 201)
    assert.equal(await status(ax.put('/api/v1/applications/scope-created', { ...base(), publicationSites: [stagingKey] })), 201)
  })

  test('applications:admin creates an application on a publication site', async () => {
    await orgAdmin.post('/api/v1/settings/organization/test_org1/publication-sites', site)
    const ax = (await nhiSession('applications:admin')).bearerAx
    assert.equal(await status(ax.post('/api/v1/applications', { ...base(), publicationSites: [siteKey] })), 201)
    assert.equal(await status(ax.put('/api/v1/applications/scope-created', { ...base(), publicationSites: [siteKey] })), 201)
  })

  test('a contrib cannot create an application on a publication site, an admin can', async () => {
    await orgAdmin.post('/api/v1/settings/organization/test_org1/publication-sites', site)
    const contrib = await axiosAuth('test_user5@test.com', 'test_org1')
    assert.equal(await status(contrib.post('/api/v1/applications', { ...base(), publicationSites: [siteKey] })), 403)
    assert.equal(await status(contrib.put('/api/v1/applications/contrib-created', { ...base(), publicationSites: [siteKey] })), 403)
    assert.equal(await countCreated(), 0)
    assert.equal(await status(orgAdmin.post('/api/v1/applications', { ...base(), publicationSites: [siteKey] })), 201)
  })
})

test.describe('application configuration referencing datasets', () => {
  test.beforeEach(async () => { await clean() })

  test('applications:read needs datasets:read to read a configuration that references a dataset', async () => {
    await createDataset('scope-cfg')
    const ds = (await orgAdmin.get('/api/v1/datasets/scope-cfg')).data
    const app = (await orgAdmin.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Scope cfg app' })).data
    await orgAdmin.put(`/api/v1/applications/${app.id}/configuration`, { datasets: [{ href: ds.href, id: ds.id, title: ds.title }] })

    const appsOnly = (await nhiSession('applications:read')).bearerAx
    const refused = await appsOnly.get(`/api/v1/applications/${app.id}/configuration`).catch((err: any) => err)
    assert.equal(refused.status, 403)
    assert.match(String(refused.data), /datasets:read/)

    const both = (await nhiSession('applications:read datasets:read')).bearerAx
    const res = await both.get(`/api/v1/applications/${app.id}/configuration`)
    assert.equal(res.status, 200)
    assert.equal(res.data.datasets[0].id, ds.id)
  })
})
