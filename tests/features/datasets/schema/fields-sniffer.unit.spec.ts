import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import * as sniffer from '../../../../api/src/datasets/utils/operations.ts'

test.describe('field sniffer unit tests', () => {
  test('Work with booleans', () => {
    assert.equal(sniffer.sniff(['true', 'false']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', 'False', '1', '-1', 'vrai', 'oui']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', '']).type, 'boolean')
    assert.equal(sniffer.sniff(['true', 'yes it is']).type, 'string')
    assert.equal(sniffer.format('True', { type: 'boolean' }), true)
    assert.equal(sniffer.format('1', { type: 'boolean' }), true)
    assert.equal(sniffer.format('-1', { type: 'boolean' }), false)
    assert.equal(sniffer.format('vrai', { type: 'boolean' }), true)
    assert.equal(sniffer.format('faux', { type: 'boolean' }), false)
    assert.equal(sniffer.format('oui', { type: 'boolean' }), true)
    assert.equal(sniffer.format('non', { type: 'boolean' }), false)
    assert.equal(sniffer.format('yes', { type: 'boolean' }), true)
    assert.equal(sniffer.format('no', { type: 'boolean' }), false)
  })

  test('Work with numbers', () => {
    assert.equal(sniffer.sniff(['1.1', '2.2']).type, 'number')
    assert.equal(sniffer.sniff(['1', '22']).type, 'integer')
    assert.equal(sniffer.sniff(['1', '10 426']).type, 'integer')
    assert.equal(sniffer.sniff(['27\u202f589']).type, 'integer') // I don't know what is that whitespace char, but it is not a simple space
    assert.equal(sniffer.sniff(['111', '-2.2']).type, 'number')
    assert.equal(sniffer.sniff(['1', '20 000.2']).type, 'number')
    assert.equal(sniffer.sniff(['10,10']).type, 'number')
    assert.equal(sniffer.format('-11', { type: 'number' }), -11)
    assert.equal(sniffer.format('-1', { type: 'integer' }), -1)
    assert.equal(sniffer.format('10 426', { type: 'integer' }), 10426)
    assert.equal(sniffer.format('20 000.2', { type: 'number' }), 20000.2)
    assert.equal(sniffer.format('27\u202f589', { type: 'integer' }), 27589)
    assert.equal(sniffer.format('10,10', { type: 'number' }), 10.1)
    assert.equal(sniffer.sniff(['_0', '   10 426']).type, 'integer')
  })

  test('Work with dates', () => {
    assert.deepEqual(sniffer.sniff([' 2017-11-29', '2017-12-12']), { type: 'string', format: 'date' })
    assert.deepEqual(sniffer.sniff([' 2017-11-29T12:24:36.816Z ']), { type: 'string', format: 'date-time' })
    assert.deepEqual(sniffer.sniff(['2019-11-14T14:00:12']), { type: 'string', format: 'date-time', dateTimeFormat: 'YYYY-MM-DDTHH:mm:ss' })
  })

  test('Work with keywords and texts', () => {
    assert.deepEqual(sniffer.sniff(['id1', 'id2']), { type: 'string' })
    assert.deepEqual(sniffer.sniff(['id1', 'a text with whitespaces']), { type: 'string' })
  })

  test('Default type is empty (will be removed from schema)', () => {
    assert.deepEqual(sniffer.sniff([]), { type: 'empty' })
  })

  test('escape key algorithme should normalize column keys', () => {
    assert.equal(sniffer.escapeKey('TEST'), 'test')
    assert.equal(sniffer.escapeKey('test 1'), 'test_1')
    assert.equal(sniffer.escapeKey('Superficie des logements >100 m2'), 'superficie_des_logements_greater100_m2')
    assert.equal(sniffer.escapeKey('Superficie des logements >100 m2', 'compat-ods'), 'superficie_des_logements_100_m2')
    assert.equal(sniffer.escapeKey('Nombre d\'habitants', 'compat-ods'), 'nombre_d_habitants')
    assert.equal(sniffer.escapeKey('Consommation HTA  - Segments C1+C2+C3', 'compat-ods'), 'consommation_hta_segments_c1_c2_c3')
    assert.equal(sniffer.escapeKey('Société', 'compat-ods'), 'societe')
    assert.equal(sniffer.escapeKey('Température normale lissée (°C)', 'compat-ods'), 'temperature_normale_lissee_degc')
    assert.equal(sniffer.escapeKey('Thermosensibilité moyenne (kWh DJU)', 'compat-ods'), 'thermosensibilite_moyenne_kwh_dju')
  })
})
