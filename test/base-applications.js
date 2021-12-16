const assert = require('assert').strict
const nock = require('nock')
const testUtils = require('./resources/test-utils')

describe('Base applications', () => {
  it('Get automatically imported public base applications', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].meta['application-name'], 'test1')
    assert.equal(res.data.results[0].meta.title.fr, 'Title test1')
    assert.equal(res.data.results[0].meta.description.fr, 'Description test1')
  })

  it('Get automatically imported private base app', async () => {
    // Only public at first
    const ax = global.ax.dmeadus
    let res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)

    // super admin patchs the private one
    const adminAx = global.ax.superadmin
    res = await adminAx.get('/api/v1/admin/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    await adminAx.patch('/api/v1/base-applications/http:monapp2.com', {
      privateAccess: [{ type: 'user', id: 'dmeadus0' }, { type: 'user', id: 'another' }],
    })
    assert.equal(res.status, 200)

    // User sees the public and private base app
    res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    const baseApp = res.data.results.find(a => a.url === 'http://monapp2.com/')
    assert.equal(baseApp.privateAccess.length, 1)
    assert.equal(baseApp.meta['application-name'], 'test2')
    assert.equal(baseApp.meta.title.fr, 'Title test2')
    assert.equal(baseApp.meta.description.fr, 'Description test2')
  })

  it('Get base apps completed with contextual dataset', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get('/api/v1/base-applications?dataset=' + dataset.id)
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    const app = res.data.results[0]
    assert.equal(app.category, 'autre')
    assert.equal(app.disabled.length, 1)
    assert.equal(app.disabled[0], 'n\'utilise pas de jeu de données comme source.')
  })

  it('Fails on broken HTML', async () => {
    const html = `
      <html>
        <head
    `
    nock('http://monapp3.com/')
      .get('/index.html').query(true).reply(200, html)
      .get('/config-schema.json').query(true).reply(200, {})
      await assert.rejects(
        async () => global.ax.superadmin.post('/api/v1/base-applications', { url: 'http://monapp3.com' }),
        (err) => {
          assert.equal(err.data, 'La page à l\'adresse http://monapp3.com/ ne semble pas héberger une application compatible avec ce service.')
          return true
        })
  })

  it('Init base app with locale', async () => {
    const html = `
      <html lang="en">
        <head>
          <meta name="application-name" content="appEN">
          <script type="text/javascript">window.APPLICATION=%APPLICATION%;</script>
          <title>Title EN</title>
          <meta name="description" content="Description EN">
        </head>
        <body>My app body</body>
      </html>
    `
    nock('http://monapp4.com/')
      .get('/index.html').query(true).reply(200, html)
      .get('/config-schema.json').query(true).reply(200, {})
    const baseApp = (await global.ax.superadmin.post('/api/v1/base-applications', { url: 'http://monapp4.com' })).data
    assert.equal(baseApp.meta['application-name'], 'appEN')
    assert.equal(baseApp.meta.title.en, 'Title EN')
    assert.equal(baseApp.meta.description.en, 'Description EN')
  })

  it('Init base app with internationalized matadata', async () => {
    const html = `
      <html>
        <head>
          <meta name="application-name" content="appI18N">
          <script type="text/javascript">window.APPLICATION=%APPLICATION%;</script>
          <title lang="fr">Titre FR</title>
          <title lang="en">Title EN</title>
          <meta name="description" lang="fr" content="Description FR">
          <meta name="description" lang="en" content="Description EN">
        </head>
        <body>My app body</body>
      </html>
    `
    nock('http://monapp5.com/')
      .get('/index.html').query(true).reply(200, html)
      .get('/config-schema.json').query(true).reply(200, {})
    const baseApp = (await global.ax.superadmin.post('/api/v1/base-applications', { url: 'http://monapp5.com' })).data
    assert.equal(baseApp.meta['application-name'], 'appI18N')
    assert.equal(baseApp.meta.title.fr, 'Titre FR')
    assert.equal(baseApp.meta.description.fr, 'Description FR')
    assert.equal(baseApp.meta.title.en, 'Title EN')
    assert.equal(baseApp.meta.description.en, 'Description EN')
  })
})
