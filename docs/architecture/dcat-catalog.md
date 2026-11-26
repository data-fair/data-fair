# DCAT catalog export

A publication site exposes its datasets as a DCAT catalog on `/catalog/dcat` of the site catalog
API (`/data-fair/api/v1/catalog/dcat` on the portal domain), for harvesting by other portals
(data.gouv.fr, data.europa.eu, CKAN with ckanext-dcat...). The profile is
[DCAT-AP 3](https://semiceu.github.io/DCAT-AP/releases/3.0.0/), the European one, serialized as
JSON-LD (`application/ld+json`). It is built by a pure function in `api/src/catalog/operations.ts`
from the datasets published on the site (`findCatalogDatasets`, at most 10 000, no pagination).

## Why DCAT-AP only

The route served DCAT-US 1.1 (the US "data.json" profile) until 2026-11; it was replaced in place,
not kept beside DCAT-AP. Our harvesters are European and expect DCAT-AP, and data.gouv.fr already
read the DCAT-US document as RDF through its JSON-LD context, so a second profile only doubled the
mapping to maintain. The replacement broke two things for the existing consumers, accepted on
purpose: the JSON keys (prefixed DCAT-AP terms instead of the DCAT-US ones) and `dct:identifier`
(the dataset `id` instead of its slug), so a harvest made on the old document recreates its
datasets once.

Another serialization of the same profile (Turtle, RDF/XML) would fit a `format` query parameter;
JSON-LD is accepted by data.gouv.fr and data.europa.eu, so none is served yet.

## Mapping

- **Catalog**: `@id` is the route URL; `dct:title` the site title, `dct:publisher` the site owner,
  `foaf:homepage` the site URL, `dct:modified` the most recent dataset modification.
- **Dataset**: `@id` and `dcat:landingPage` are the portal page (`datasetUrlTemplate`).
  `dct:identifier` is the dataset `id`, not its slug: data.gouv.fr keys harvested datasets on it,
  and the id survives a slug change. Dates are typed (`xsd:date` or `xsd:dateTime` after their
  shape), `frequency` maps to the EU frequency vocabulary (`continuous` → `UPDATE_CONT`), topics to
  `dcat:theme` concepts (the shapes want an IRI: the portal page filtered on the topic,
  `<site>/datasets?topics=<id>`), `spatial` and `bbox` to a `dct:Location` with a WKT `dcat:bbox`, the owner
  (with its department) to `dct:publisher`, `creator` to `dct:creator`, the owner contact settings
  (`settings.info.contact`) to `dcat:contactPoint`.
- **Distributions**: the original file (`/raw`) and the converted file (`/convert`, when its type
  differs) with `dcat:downloadURL`, `dcat:byteSize`, an EU file-type `dct:format` and an IANA
  `dcat:mediaType`; the attachments flagged `includeInCatalogPublications`; and, for every dataset
  that has data (all but meta-only ones), an API distribution (`/lines`) whose
  `dcat:accessService` is a `dcat:DataService` pointing to the dataset API and its OpenAPI
  document. REST and virtual datasets have no file, the API distribution is their only one.
- IRIs from a controlled vocabulary carry their range class (`dct:LicenseDocument`,
  `dct:Frequency`, `dct:MediaTypeOrExtent`...): the DCAT-AP SHACL shapes check it.

The OpenAPI link of the API distribution lives on its `dcat:DataService`
(`dcat:endpointDescription`), the DCAT-AP way. data.gouv.fr reads the distribution as an API
resource but does not show that link: it only creates an "API" entry for a `dcat:DataService`
that is not the `accessService` of a distribution.

The output conforms to the official DCAT-AP 3.0 SHACL shapes (`dcat-ap-SHACL.ttl` of the SEMIC
release) under RDFS inference; without inference only `rdfs:Resource` checks on plain URLs fail.

## Known gaps

- `dct:license` holds the license URL as entered: data.gouv.fr matches it against its own license
  list (URLs and known alternate URLs), an unknown URL ends as "license not specified".
- No `dct:language`, no EU data-theme vocabulary for `dcat:theme` (topics are free labels), no
  pagination (`hydra:PartialCollectionView`).
