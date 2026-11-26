import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import jsonld from 'jsonld'
import { buildDcatCatalog } from '../../../api/src/catalog/operations.ts'

const publicationSite = { type: 'data-fair-portals', id: 'portal1', url: 'https://portal.test' }

const dcat = 'http://www.w3.org/ns/dcat#'
const dct = 'http://purl.org/dc/terms/'
const xsd = 'http://www.w3.org/2001/XMLSchema#'

// expanded JSON-LD: checks the real RDF terms and datatypes, not only the compacted keys
const expand = async (doc: any) => (await jsonld.expand(JSON.parse(JSON.stringify(doc))))[0] as any

test.describe('buildDcatCatalog', () => {
  const site = { ...publicationSite, title: 'My portal', owner: { type: 'organization', id: 'o1', name: 'My org' } }
  const fileDataset = {
    id: 'd1',
    slug: 'my-data',
    title: 'My data',
    description: 'Some **markdown**',
    createdAt: '2026-01-01T10:00:00.000Z',
    dataUpdatedAt: '2026-02-01T10:00:00.000Z',
    modified: '2026-01-15',
    keywords: ['energy'],
    topics: [{ id: 't1', title: 'Environment' }],
    license: { href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence', title: 'Licence Ouverte' },
    frequency: 'annual',
    temporal: { start: '2022-01-01', end: '2022-12-31' },
    spatial: 'France',
    bbox: [-5, 41, 9, 51],
    owner: { type: 'organization', id: 'o1', name: 'My org' },
    creator: 'A producer',
    file: { name: 'data.csv', mimetype: 'text/csv', size: 10 },
    originalFile: { name: 'data.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 20 }
  }

  test('describes the catalog with its mandatory DCAT-AP properties', async () => {
    const result = buildDcatCatalog([fileDataset], site, 'https://df.test', { contact: { email: 'contact@org.test' } })
    const catalog = await expand(result)
    assert.deepEqual(catalog['@type'], [dcat + 'Catalog'])
    assert.equal(catalog['@id'], 'https://df.test/api/v1/catalog/dcat')
    assert.equal(catalog[dct + 'title'][0]['@value'], 'My portal')
    assert.ok(catalog[dct + 'description'][0]['@value'])
    assert.equal(catalog[dct + 'publisher'][0]['http://xmlns.com/foaf/0.1/name'][0]['@value'], 'My org')
    assert.equal(catalog['http://xmlns.com/foaf/0.1/homepage'][0]['@id'], 'https://portal.test')
    assert.equal(catalog[dcat + 'dataset'].length, 1)
  })

  test('maps the dataset metadata to DCAT-AP terms, IRIs and typed literals', async () => {
    const result = buildDcatCatalog([fileDataset], site, 'https://df.test', { contact: { name: 'Team', email: 'contact@org.test' } })
    const ds = (await expand(result))[dcat + 'dataset'][0]
    assert.equal(ds['@id'], 'https://portal.test/datasets/d1')
    assert.equal(ds[dct + 'identifier'][0]['@value'], 'd1')
    assert.equal(ds[dcat + 'landingPage'][0]['@id'], 'https://portal.test/datasets/d1')
    assert.deepEqual(ds[dct + 'issued'][0], { '@value': '2026-01-01T10:00:00.000Z', '@type': xsd + 'dateTime' })
    assert.deepEqual(ds[dct + 'modified'][0], { '@value': '2026-01-15', '@type': xsd + 'date' })
    assert.equal(ds[dct + 'license'][0]['@id'], 'https://www.etalab.gouv.fr/licence-ouverte-open-licence')
    assert.equal(ds[dct + 'accrualPeriodicity'][0]['@id'], 'http://publications.europa.eu/resource/authority/frequency/ANNUAL')
    assert.equal(ds[dcat + 'theme'][0]['http://www.w3.org/2004/02/skos/core#prefLabel'][0]['@value'], 'Environment')
    assert.equal(ds[dcat + 'keyword'][0]['@value'], 'energy')
    const temporal = ds[dct + 'temporal'][0]
    assert.deepEqual(temporal['@type'], [dct + 'PeriodOfTime'])
    assert.deepEqual(temporal[dcat + 'startDate'][0], { '@value': '2022-01-01', '@type': xsd + 'date' })
    assert.equal(ds[dct + 'spatial'][0][dcat + 'bbox'][0]['@value'], 'POLYGON((-5 41, 9 41, 9 51, -5 51, -5 41))')
    assert.equal(ds[dct + 'creator'][0]['http://xmlns.com/foaf/0.1/name'][0]['@value'], 'A producer')
    assert.equal(ds[dcat + 'contactPoint'][0]['http://www.w3.org/2006/vcard/ns#hasEmail'][0]['@id'], 'mailto:contact@org.test')
  })

  test('gives every distribution an accessURL, IRI formats and a byteSize', async () => {
    const ds = (await expand(buildDcatCatalog([fileDataset], site, 'https://df.test')))[dcat + 'dataset'][0]
    const [raw, convert, api] = ds[dcat + 'distribution']
    assert.equal(ds[dcat + 'distribution'].length, 3)
    for (const distribution of [raw, convert, api]) assert.ok(distribution[dcat + 'accessURL'][0]['@id'])
    assert.equal(raw[dcat + 'downloadURL'][0]['@id'], 'https://df.test/api/v1/datasets/my-data/raw')
    assert.equal(raw[dct + 'format'][0]['@id'], 'http://publications.europa.eu/resource/authority/file-type/XLSX')
    assert.equal(convert[dcat + 'mediaType'][0]['@id'], 'https://www.iana.org/assignments/media-types/text/csv')
    assert.deepEqual(convert[dcat + 'byteSize'][0], { '@value': 10, '@type': xsd + 'nonNegativeInteger' })
    const service = api[dcat + 'accessService'][0]
    assert.equal(service[dcat + 'endpointURL'][0]['@id'], 'https://df.test/api/v1/datasets/my-data')
    assert.equal(service[dcat + 'endpointDescription'][0]['@id'], 'https://df.test/api/v1/datasets/my-data/api-docs.json')
  })

  test('gives REST datasets an API distribution and meta-only datasets none', () => {
    const result = buildDcatCatalog([
      { id: 'rest1', title: 'Rest', isRest: true, owner: site.owner },
      { id: 'meta1', title: 'Meta', isMetaOnly: true, owner: site.owner }
    ], site, 'https://df.test')
    assert.equal(result['dcat:dataset'][0]['dcat:distribution']?.length, 1)
    assert.equal(result['dcat:dataset'][0]['dcat:distribution']?.[0]['dcat:accessURL']['@id'], 'https://df.test/api/v1/datasets/rest1/lines')
    assert.equal(result['dcat:dataset'][1]['dcat:distribution'], undefined)
  })

  test('adds the attachments flagged for catalog publications as distributions', () => {
    const result = buildDcatCatalog([{
      id: 'm1',
      title: 'Meta',
      isMetaOnly: true,
      attachments: [
        { type: 'file', name: 'doc 1.pdf', title: 'Documentation', mimetype: 'application/pdf', size: 5, includeInCatalogPublications: true },
        { type: 'url', url: 'https://other.test/data.csv?token=1', title: 'Link', includeInCatalogPublications: true },
        { type: 'file', name: 'thumb.jpg', title: 'Not published' }
      ]
    }], site, 'https://df.test')
    const distributions = result['dcat:dataset'][0]['dcat:distribution']!
    assert.equal(distributions.length, 2)
    assert.equal(distributions[0]['@id'], 'https://df.test/api/v1/datasets/m1/metadata-attachments/doc%201.pdf')
    assert.equal(distributions[0]['dct:title'], 'Documentation')
    assert.equal(distributions[0]['dct:format']?.['@id'], 'http://publications.europa.eu/resource/authority/file-type/PDF')
    assert.equal(distributions[1]['dcat:accessURL']['@id'], 'https://other.test/data.csv?token=1')
    assert.equal(distributions[1]['dct:format']?.['@id'], 'http://publications.europa.eu/resource/authority/file-type/CSV')
    // a blank node without the dataset license: the same link on 2 datasets must not merge their distributions
    assert.equal(distributions[1]['@id'], undefined)
    assert.equal(distributions[1]['dct:license'], undefined)
    assert.equal(distributions[1]['dcat:downloadURL'], undefined)
  })

  test('leaves out the distributions the caller cannot reach', () => {
    const dataset = {
      ...fileDataset,
      attachments: [
        { type: 'file', name: 'doc.pdf', title: 'Documentation', includeInCatalogPublications: true },
        { type: 'url', url: 'https://other.test/page', title: 'Link', includeInCatalogPublications: true }
      ]
    }
    const result = buildDcatCatalog([dataset], site, 'https://df.test', {}, 'fr', () => false)
    const distributions = result['dcat:dataset'][0]['dcat:distribution']!
    assert.deepEqual(distributions.map((d: any) => d['dcat:accessURL']['@id']), ['https://other.test/page'])
  })

  test('uses the datasetUrlTemplate and each dataset own modification date', () => {
    const result = buildDcatCatalog([
      { id: 'd1', slug: 'my-data', title: 'A', dataUpdatedAt: '2026-01-01', updatedAt: '2026-02-01' },
      { id: 'd2', slug: 'other', title: 'B', updatedAt: '2026-03-01' }
    ], { ...site, datasetUrlTemplate: 'https://portal.test/jeux/{slug}' }, 'https://df.test')
    assert.equal(result['dcat:dataset'][0]['@id'], 'https://portal.test/jeux/my-data')
    assert.equal(result['dcat:dataset'][0]['dct:modified']?.['@value'], '2026-01-01')
    assert.equal(result['dcat:dataset'][1]['dct:modified']?.['@value'], '2026-03-01')
    assert.equal(result['dct:modified']?.['@value'], '2026-03-01')
  })

  test('falls back on the summary then the title for the mandatory description', () => {
    const result = buildDcatCatalog([{ id: 'd1', title: 'T', summary: 'S' }, { id: 'd2', title: 'T2' }], site, 'https://df.test')
    assert.equal(result['dcat:dataset'][0]['dct:description'], 'S')
    assert.equal(result['dcat:dataset'][1]['dct:description'], 'T2')
  })
})
