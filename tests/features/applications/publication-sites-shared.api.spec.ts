import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')
const testUser6Org = await axiosAuth('test_user6@test.com', 'test_org1')

test.describe('publication sites shared with departments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('department admin can publish on an org-root site shared with their department', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      contributorDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:shared-portal'] })

    const fetched = (await testUser4Org.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(fetched.publicationSites, ['data-fair-portals:shared-portal'])
  })

  test('department admin still fails to publish on org-root site NOT shared with their department', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'other-portal',
      url: 'http://portal.com',
      contributorDepartments: ['dep2']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await assert.rejects(
      testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:other-portal'] }),
      (err: any) => err.status === 403
    )
  })

  test('department contrib cannot publish on a shared org-root non-staging site', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      contributorDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await assert.rejects(
      testUser6Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:shared-portal'] }),
      (err: any) => err.status === 403
    )
  })

  test('revoking the share traps already-published resources: dept admin can no longer unpublish', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      contributorDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:shared-portal'] })

    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', {
      ...portal,
      contributorDepartments: []
    })

    await assert.rejects(
      testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: [] }),
      (err: any) => err.status === 403
    )

    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: [] })
  })

  test('posting contributorDepartments on a dept-scoped settings doc is refused', async () => {
    await assert.rejects(
      testUser4Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', {
        type: 'data-fair-portals',
        id: 'some-portal',
        url: 'http://portal.com',
        contributorDepartments: ['dep2']
      }),
      (err: any) => err.status === 400
    )
  })

  test('GET publication-sites decorates shared sites with canContributeAsDepartment for matching dept users', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      contributorDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dep1List = (await testUser4Org.get('/api/v1/settings/organization/test_org1:dep1/publication-sites')).data
    const shared = dep1List.find((s: any) => s.id === 'shared-portal')
    assert.ok(shared)
    assert.equal(shared.canContributeAsDepartment, true)

    const orgList = (await testUser1Org.get('/api/v1/settings/organization/test_org1/publication-sites')).data
    const orgShared = orgList.find((s: any) => s.id === 'shared-portal')
    assert.deepEqual(orgShared.contributorDepartments, ['dep1'])
    assert.equal(orgShared.canContributeAsDepartment, undefined)
  })
})
