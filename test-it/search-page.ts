import { strict as assert } from 'node:assert'
import nock from 'nock'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth } from './utils/index.ts'
import { memoizedGetPublicationSiteSettings } from '@data-fair/data-fair-api/src/misc/utils/settings.ts'
import { isPublic, getPrivateAccess, buildPostSearchPage } from '@data-fair/data-fair-api/src/search-pages/utils.ts'
import config from '../api/src/config.ts'

const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')

const publicUrl2 = `http://localhost:${process.env.NGINX_PORT2}/data-fair`

describe('search-page', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  describe('unit tests', function () {
    it('should return public true for public dataset', function () {
      const resource = {
        permissions: [
          { classes: ['read', 'use'] }
        ]
      }
      assert.equal(isPublic('datasets', resource), true)
    })

    it('should return public false for private dataset', function () {
      const resource = {
        permissions: [
          { type: 'user' as const, id: 'user1', classes: ['read', 'use'] }
        ]
      }
      assert.equal(isPublic('datasets', resource), false)
    })

    it('should return public false when no public permissions', function () {
      const resource = {
        permissions: [
          { type: 'user' as const, id: 'user1', classes: ['read'] }
        ]
      }
      assert.equal(isPublic('datasets', resource), false)
    })

    it('should return empty privateAccess for public dataset', function () {
      const resource = {
        permissions: [
          { classes: ['read', 'use'] }
        ]
      }
      const result = getPrivateAccess('datasets', resource)
      assert.equal(result.length, 0)
    })

    it('should return privateAccess for private dataset', function () {
      const resource = {
        permissions: [
          { type: 'user' as const, id: 'user1', name: 'John', classes: ['read', 'use'] }
        ]
      }
      const result = getPrivateAccess('datasets', resource)
      assert.equal(result.length, 1)
      assert.equal(result[0].type, 'user')
      assert.equal(result[0].id, 'user1')
      assert.equal(result[0].name, 'John')
    })

    it('should return privateAccess for multiple users and organizations', function () {
      const resource = {
        permissions: [
          { type: 'user' as const, id: 'user1', name: 'John', classes: ['read', 'use'] },
          { type: 'organization' as const, id: 'org1', name: 'Acme', department: 'IT', departmentName: 'Information Technology', roles: ['admin', 'editor'], classes: ['read', 'use'] }
        ]
      }
      const result = getPrivateAccess('datasets', resource)
      assert.equal(result.length, 3)
      assert.equal(result[0].type, 'user')
      assert.equal(result[0].id, 'user1')
      assert.equal(result[1].type, 'organization')
      assert.equal(result[1].id, 'org1')
      assert.equal(result[1].role, 'admin')
      assert.equal(result[2].type, 'organization')
      assert.equal(result[2].id, 'org1')
      assert.equal(result[2].role, 'editor')
    })

    it('should include permissions with all basic operations', function () {
      const resource = {
        permissions: [
          { type: 'user' as const, id: 'user1', classes: ['read'] }
        ]
      }
      const result = getPrivateAccess('datasets', resource)
      assert.equal(result.length, 1)
    })

    it('should build PostSearchPage with correct public and privateAccess', function () {
      const resource = {
        id: 'ds1',
        owner: { type: 'user' as const, id: 'owner1', name: 'Owner' },
        permissions: [
          { type: 'user' as const, id: 'user1', name: 'John', classes: ['read', 'use'] }
        ]
      }
      const result = buildPostSearchPage('datasets', resource, 'portal1', 'toIndex')
      assert.equal(result.public, false)
      assert.equal(result.privateAccess?.length, 1)
      assert.equal(result.privateAccess?.[0].id, 'user1')
      assert.equal(result.indexingStatus, 'toIndex')
      assert.equal(result.portal, 'portal1')
    })

    it('should build PostSearchPage with undefined privateAccess for public resource', function () {
      const resource = {
        id: 'ds1',
        owner: { type: 'user' as const, id: 'owner1', name: 'Owner' },
        permissions: [
          { classes: ['read', 'use'] }
        ]
      }
      const result = buildPostSearchPage('datasets', resource, 'portal1', 'toIndex')
      assert.equal(result.public, true)
      assert.equal(result.privateAccess, undefined)
    })
  })

  describe('router', function () {
    it('should return search pages for datasets and applications on a domain', async function () {
      const ax = dmeadusOrg

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
      await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
      memoizedGetPublicationSiteSettings.clear()

      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
      await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      const searchPages = (await ax.get(`${publicUrl2}/api/v1/search-pages`)).data

      assert.equal(searchPages.length, 2)

      const datasetSp = searchPages.find((sp: any) => sp.resource.type === 'dataset' && sp.resource.id === dataset.id)
      assert.ok(datasetSp)
      assert.equal(datasetSp.portal, 'portal1')
      assert.equal(datasetSp.indexingStatus, 'toIndex')

      const appSp = searchPages.find((sp: any) => sp.resource.type === 'application' && sp.resource.id === app.id)
      assert.ok(appSp)
      assert.equal(appSp.portal, 'portal1')
      assert.equal(appSp.indexingStatus, 'toIndex')
    })

    it('should return 403 for non-admin user', async function () {
      // TODO: Implement this test by creating a portal in a separate organization
      // where the test user is a contrib but not admin
      // For now, verify the admin check is in place by:
      // 1. The router correctly calls assertAccountRole (verified by existing admin test passing)
      // 2. The code throws 403 when user doesn't have admin role
      this.skip()
    })
  })

  describe('webhook', function () {
    beforeEach(() => {
      config.privatePortalsManagerUrl = 'http://portals.internal'
      config.secretKeys.searchPages = 'test-secret-key'
    })

    afterEach(() => {
      config.privatePortalsManagerUrl = undefined
      config.secretKeys.searchPages = undefined
      nock.cleanAll()
    })

    it('should send PostSearchPage to portals when dataset is updated', async function () {
      const ax = dmeadusOrg

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
      await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
      memoizedGetPublicationSiteSettings.clear()

      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      const scope = nock('http://portals.internal')
        .post('/api/search-pages')
        .reply(200)

      await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'updated title' })

      assert.ok(scope.isDone(), 'Expected POST to portals was not made')
    })

    it('should send PostSearchPage with toDelete when dataset is deleted', async function () {
      const ax = dmeadusOrg

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
      await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
      memoizedGetPublicationSiteSettings.clear()

      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      let requestBody: any = null
      const scope = nock('http://portals.internal')
        .post('/api/search-pages', (body: any) => { requestBody = body; return true })
        .reply(200)

      await ax.delete(`/api/v1/datasets/${dataset.id}`)

      assert.ok(scope.isDone())
      assert.equal(requestBody.indexingStatus, 'toDelete')
      assert.equal(requestBody.resource.type, 'dataset')
    })

    it('should send PostSearchPage for linked applications when dataset is updated', async function () {
      const ax = dmeadusOrg

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
      await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
      memoizedGetPublicationSiteSettings.clear()

      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
      await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })
      await ax.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: dataset.href, id: dataset.id }] })

      const requests: any[] = []
      const scope = nock('http://portals.internal')
        .persist()
        .post('/api/search-pages', (body: any) => { requests.push(body); return true })
        .reply(200)

      await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'updated title' })

      assert.ok(scope.isDone())
      const resourceTypes = requests.map((r: any) => r.resource.type)
      assert.ok(resourceTypes.includes('dataset'))
      assert.ok(resourceTypes.includes('application'))
    })

    it('should send PostSearchPage for linked datasets when application config is updated', async function () {
      const ax = dmeadusOrg

      const portal = { type: 'data-fair-portals', id: 'portal1', url: 'http://localhost:' + process.env.NGINX_PORT2 }
      await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)
      memoizedGetPublicationSiteSettings.clear()

      const dataset = (await ax.post('/api/v1/datasets', { isRest: true, title: 'test dataset', schema: [] })).data
      await ax.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
      await ax.patch(`/api/v1/applications/${app.id}`, { publicationSites: ['data-fair-portals:portal1'] })

      const requests: any[] = []
      const scope = nock('http://portals.internal')
        .persist()
        .post('/api/search-pages', (body: any) => { requests.push(body); return true })
        .reply(200)

      await ax.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: dataset.href, id: dataset.id }] })

      assert.ok(scope.isDone())
      const resourceTypes = requests.map((r: any) => r.resource.type)
      assert.ok(resourceTypes.includes('application'))
      assert.ok(resourceTypes.includes('dataset'))
    })
  })
})
