import { escapeKey } from '../api/src/datasets/utils/fields-sniffer.js'
import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'

describe('escape key algorithme', function () {
  it('should normalize column keys', function () {
    assert.equal(escapeKey('TEST'), 'test')
    assert.equal(escapeKey('test 1'), 'test_1')
    assert.equal(escapeKey('Superficie des logements >100 m2'), 'superficie_des_logements_greater100_m2')
    assert.equal(escapeKey('Superficie des logements >100 m2', 'compat-ods'), 'superficie_des_logements_100_m2')
    assert.equal(escapeKey('Nombre d\'habitants', 'compat-ods'), 'nombre_d_habitants')
    assert.equal(escapeKey('Consommation HTA  - Segments C1+C2+C3', 'compat-ods'), 'consommation_hta_segments_c1_c2_c3')
    assert.equal(escapeKey('Société', 'compat-ods'), 'societe')
    assert.equal(escapeKey('Température normale lissée (°C)', 'compat-ods'), 'temperature_normale_lissee_degc')
    assert.equal(escapeKey('Thermosensibilité moyenne (kWh DJU)', 'compat-ods'), 'thermosensibilite_moyenne_kwh_dju')
  })
})
