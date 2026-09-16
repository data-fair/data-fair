import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { trimApplication } from '../../../api/src/applications/operations.ts'

test.describe('trimApplication', () => {
  test('trims descriptive metadata and attachment titles', () => {
    const app: any = {
      title: ' Title ',
      summary: ' Summary ',
      description: ' Desc ',
      image: ' https://example.com/img.png ',
      attachments: [{ title: ' Doc ', name: 'doc.pdf' }]
    }
    trimApplication(app)
    assert.equal(app.title, 'Title')
    assert.equal(app.summary, 'Summary')
    assert.equal(app.description, 'Desc')
    assert.equal(app.image, 'https://example.com/img.png')
    assert.deepEqual(app.attachments, [{ title: 'Doc', name: 'doc.pdf' }])
  })

  test('leaves configuration untouched', () => {
    const app: any = { configuration: { label: ' keep ' }, configurationDraft: { label: ' keep ' } }
    trimApplication(app)
    assert.deepEqual(app.configuration, { label: ' keep ' })
    assert.deepEqual(app.configurationDraft, { label: ' keep ' })
  })

  test('ignores absent fields', () => {
    const app: any = { id: 'a' }
    trimApplication(app)
    assert.deepEqual(app, { id: 'a' })
  })
})
