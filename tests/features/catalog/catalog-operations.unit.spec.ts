import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import jsonld from 'jsonld'
import { buildDcatCatalog, buildDcatApCatalog } from '../../../api/src/catalog/operations.ts'
import dcatUsValidate from '../../../api/src/misc/utils/dcat/validate.ts'

const publicationSite = { type: 'data-fair-portals', id: 'portal1', url: 'https://portal.test' }

const dcat = 'http://www.w3.org/ns/dcat#'
const dct = 'http://purl.org/dc/terms/'
const xsd = 'http://www.w3.org/2001/XMLSchema#'

// expanded JSON-LD: checks the real RDF terms and datatypes, not only the compacted keys
const expand = async (doc: any) => (await jsonld.expand(JSON.parse(JSON.stringify(doc))))[0] as any

test.describe('buildDcatCatalog', () => {
  test('wraps datasets in a DCAT Catalog envelope', () => {
    const result = buildDcatCatalog([], publicationSite, 'https://df.test')
    assert.equal(result['@type'], 'Catalog')
    assert.equal(result.conformsTo, 'https://project-open-data.cio.gov/v1.1/schema')
    assert.deepEqual(result.dataset, [])
  })

  test('builds a Dataset entry using the publication site datasetUrlTemplate when present', () => {
    const result = buildDcatCatalog(
      [{ id: 'd1', slug: 'my-data', title: 'My data', createdAt: '2026-01-01' }],
      { ...publicationSite, datasetUrlTemplate: 'https://portal.test/jeux/{slug}' },
      'https://df.test'
    )
    const ds = result.dataset[0]
    assert.equal(ds['@id'], 'https://portal.test/jeux/my-data')
    assert.equal(ds.identifier, 'my-data')
    assert.equal(ds.title, 'My data')
  })

  test('emits raw and convert distributions when the file mimetype differs from the original', () => {
    const result = buildDcatCatalog(
      [{
        id: 'd1',
        title: 'With file',
        file: { name: 'data.csv', mimetype: 'text/csv', size: 10 },
        originalFile: { name: 'data.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 20 }
      }],
      publicationSite,
      'https://df.test'
    )
    const distribution = result.dataset[0].distribution
    assert.equal(distribution.length, 3)
    assert.equal(distribution[0].downloadURL, 'https://df.test/api/v1/datasets/d1/raw')
    assert.equal(distribution[0].byteSize, 20)
    assert.equal(distribution[1].downloadURL, 'https://df.test/api/v1/datasets/d1/convert')
    assert.equal(distribution[2].format, 'API')
  })

  test('sets modified from each dataset own dataUpdatedAt (falling back to its updatedAt)', () => {
    const result = buildDcatCatalog(
      [
        { id: 'd1', title: 'A', dataUpdatedAt: '2026-01-01', updatedAt: '2026-02-01' },
        { id: 'd2', title: 'B', updatedAt: '2026-03-01' }
      ],
      publicationSite,
      'https://df.test'
    )
    assert.equal(result.dataset[0].modified, '2026-01-01')
    assert.equal(result.dataset[1].modified, '2026-03-01')
  })

  test('emits a single distribution when file and original share the same mimetype', () => {
    const result = buildDcatCatalog(
      [{
        id: 'd1',
        title: 'Same mimetype',
        file: { name: 'data.csv', mimetype: 'text/csv', size: 10 },
        originalFile: { name: 'data.csv', mimetype: 'text/csv', size: 10 }
      }],
      publicationSite,
      'https://df.test'
    )
    assert.equal(result.dataset[0].distribution.length, 2)
  })

  test('outputs a valid DCAT-US document with publisher, contact point, themes and an API distribution', async () => {
    const result = buildDcatCatalog([{
      id: 'd1',
      slug: 'my-data',
      title: 'My data',
      description: 'Full description',
      summary: 'Short',
      createdAt: '2026-01-01T10:00:00.000Z',
      dataUpdatedAt: '2026-02-01T10:00:00.000Z',
      keywords: ['energy'],
      topics: [{ id: 't1', title: 'Environment' }],
      license: { href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' },
      frequency: 'annual',
      bbox: [-5, 41, 9, 51],
      owner: { type: 'organization', id: 'o1', name: 'My org', departmentName: 'Dep' },
      isRest: true
    }], { ...publicationSite, owner: { type: 'organization', id: 'o1', name: 'My org' } }, 'https://df.test', { contact: { email: 'contact@org.test' } })
    assert.ok(dcatUsValidate(result), JSON.stringify(dcatUsValidate.errors))
    const ds = result.dataset[0]
    assert.equal(ds.description, 'Full description')
    assert.deepEqual(ds.publisher, { '@type': 'org:Organization', name: 'My org - Dep' })
    assert.deepEqual(ds.contactPoint, { '@type': 'vcard:Contact', fn: 'My org', hasEmail: 'mailto:contact@org.test' })
    assert.deepEqual(ds.theme, ['Environment'])
    assert.equal(ds.spatial, '-5,41,9,51')
    assert.equal(ds.distribution[0].describedBy, 'https://df.test/api/v1/datasets/my-data/api-docs.json')

    // same JSON shape, but real IRIs and date-time datatypes once read as RDF
    const expanded = await expand(result)
    const eds = expanded[dcat + 'dataset'][0]
    assert.deepEqual(eds[dct + 'issued'][0], { '@value': '2026-01-01T10:00:00.000Z', '@type': xsd + 'dateTime' })
    assert.equal(eds[dcat + 'landingPage'][0]['@id'], 'https://portal.test/datasets/d1')
    assert.equal(eds[dct + 'license'][0]['@id'], 'https://www.etalab.gouv.fr/licence-ouverte-open-licence')
    assert.equal(eds[dct + 'accrualPeriodicity'][0]['@id'], 'http://purl.org/cld/freq/annual')
    assert.equal(eds[dcat + 'contactPoint'][0]['http://www.w3.org/2006/vcard/ns#hasEmail'][0]['@id'], 'mailto:contact@org.test')
  })

  test('reads the file size as dcat:byteSize', async () => {
    const result = buildDcatCatalog([{
      id: 'd1',
      title: 'With file',
      file: { name: 'data.csv', mimetype: 'text/csv', size: 10 },
      originalFile: { name: 'data.csv', mimetype: 'text/csv', size: 10 }
    }], publicationSite, 'https://df.test')
    const distribution = (await expand(result))[dcat + 'dataset'][0][dcat + 'distribution'][0]
    assert.equal(distribution[dcat + 'byteSize'][0]['@value'], 10)
  })
})

test.describe('buildDcatApCatalog', () => {
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
    const result = buildDcatApCatalog([fileDataset], site, 'https://df.test', { contact: { email: 'contact@org.test' } })
    const catalog = await expand(result)
    assert.deepEqual(catalog['@type'], [dcat + 'Catalog'])
    assert.equal(catalog['@id'], 'https://df.test/api/v1/catalog/dcat-ap')
    assert.equal(catalog[dct + 'title'][0]['@value'], 'My portal')
    assert.ok(catalog[dct + 'description'][0]['@value'])
    assert.equal(catalog[dct + 'publisher'][0]['http://xmlns.com/foaf/0.1/name'][0]['@value'], 'My org')
    assert.equal(catalog['http://xmlns.com/foaf/0.1/homepage'][0]['@id'], 'https://portal.test')
    assert.equal(catalog[dcat + 'dataset'].length, 1)
  })

  test('maps the dataset metadata to DCAT-AP terms, IRIs and typed literals', async () => {
    const result = buildDcatApCatalog([fileDataset], site, 'https://df.test', { contact: { name: 'Team', email: 'contact@org.test' } })
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
    const ds = (await expand(buildDcatApCatalog([fileDataset], site, 'https://df.test')))[dcat + 'dataset'][0]
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
    const result = buildDcatApCatalog([
      { id: 'rest1', title: 'Rest', isRest: true, owner: site.owner },
      { id: 'meta1', title: 'Meta', isMetaOnly: true, owner: site.owner }
    ], site, 'https://df.test')
    assert.equal(result['dcat:dataset'][0]['dcat:distribution']?.length, 1)
    assert.equal(result['dcat:dataset'][0]['dcat:distribution']?.[0]['dcat:accessURL']['@id'], 'https://df.test/api/v1/datasets/rest1/lines')
    assert.equal(result['dcat:dataset'][1]['dcat:distribution'], undefined)
  })

  test('adds the attachments flagged for catalog publications as distributions', () => {
    const result = buildDcatApCatalog([{
      id: 'm1',
      title: 'Meta',
      isMetaOnly: true,
      attachments: [
        { type: 'file', name: 'doc 1.pdf', title: 'Documentation', mimetype: 'application/pdf', size: 5, includeInCatalogPublications: true },
        { type: 'url', url: 'https://other.test/page', title: 'Link', includeInCatalogPublications: true },
        { type: 'file', name: 'thumb.jpg', title: 'Not published' }
      ]
    }], site, 'https://df.test')
    const distributions = result['dcat:dataset'][0]['dcat:distribution']!
    assert.equal(distributions.length, 2)
    assert.equal(distributions[0]['@id'], 'https://df.test/api/v1/datasets/m1/metadata-attachments/doc%201.pdf')
    assert.equal(distributions[0]['dct:title'], 'Documentation')
    assert.equal(distributions[0]['dct:format']?.['@id'], 'http://publications.europa.eu/resource/authority/file-type/PDF')
    assert.equal(distributions[1]['dcat:accessURL']['@id'], 'https://other.test/page')
    assert.equal(distributions[1]['dcat:downloadURL'], undefined)
  })

  test('falls back on the summary then the title for the mandatory description', () => {
    const result = buildDcatApCatalog([{ id: 'd1', title: 'T', summary: 'S' }, { id: 'd2', title: 'T2' }], site, 'https://df.test')
    assert.equal(result['dcat:dataset'][0]['dct:description'], 'S')
    assert.equal(result['dcat:dataset'][1]['dct:description'], 'T2')
  })
})
