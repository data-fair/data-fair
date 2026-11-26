import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { joinProxyPath } from '../../../api/src/misc/utils/proxy-path.ts'

test.describe('joinProxyPath', () => {
  test('joins segments under the base path', () => {
    assert.equal(joinProxyPath('/s/geocoder/api', ['coord', 'search']), '/s/geocoder/api/coord/search')
    assert.equal(joinProxyPath('/s/geocoder/api/', ['coord', 'search']), '/s/geocoder/api/coord/search')
    assert.equal(joinProxyPath('/apps/my-app/', ['index.html']), '/apps/my-app/index.html')
    assert.equal(joinProxyPath('/', ['a', 'b c']), '/a/b c')
    assert.equal(joinProxyPath('', ['a']), '/a')
    assert.equal(joinProxyPath('/base', []), '/base')
    assert.equal(joinProxyPath('/base', ['a', '', 'b']), '/base/a/b')
    assert.equal(joinProxyPath('/base', ['...']), '/base/...')
  })

  test('refuses segments that would leave the base path', () => {
    for (const segments of [['..'], ['a', '..', '..', 'x'], ['.'], ['../x'], ['a/b'], ['..\\x'], ['a\0']]) {
      assert.equal(joinProxyPath('/s/geocoder/api', segments), null, JSON.stringify(segments))
    }
  })
})
