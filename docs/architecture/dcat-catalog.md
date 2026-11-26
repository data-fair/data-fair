# DCAT catalog exports

A publication site exposes its datasets as a DCAT catalog, for harvesting by other portals. Two
profiles are served, on two routes of the site catalog API (`/data-fair/api/v1/catalog/...` on the
portal domain):

| Route | Profile | Audience |
| --- | --- | --- |
| `/catalog/dcat-ap` | [DCAT-AP 3](https://semiceu.github.io/DCAT-AP/releases/3.0.0/) (European profile) | data.gouv.fr, data.europa.eu, any European harvester |
| `/catalog/dcat` | [DCAT-US 1.1](https://resources.data.gov/resources/dcat-us/) (US profile, "data.json") | kept unchanged for existing consumers |

Both are JSON-LD (`application/ld+json`), built by pure functions in `api/src/catalog/operations.ts`
from the datasets published on the site (`findCatalogDatasets`, at most 10 000, no pagination).

## Why a route per profile

A profile is a different document, not a different serialization of the same one: vocabulary,
mandatory properties and value shapes differ (`dct:temporal` is an `ISO start/end` string in
DCAT-US, a `dct:PeriodOfTime` node in DCAT-AP). A harvester is configured with one URL, so each
profile gets a stable URL of its own, as Opendatasoft and CKAN do (`/catalog/exports/dcat`,
`/catalog/exports/dcat_ap_ch`...). Other serializations of the same profile (Turtle, RDF/XML)
would fit a `format` query parameter on the same route; JSON-LD is accepted by both data.gouv.fr
and data.europa.eu, so none is served yet.

## DCAT-AP mapping

- **Catalog**: `@id` is the route URL; `dct:title` the site title, `dct:publisher` the site owner,
  `foaf:homepage` the site URL, `dct:modified` the most recent dataset modification.
- **Dataset**: `@id` and `dcat:landingPage` are the portal page (`datasetUrlTemplate`).
  `dct:identifier` is the dataset `id`, not its slug: data.gouv.fr keys harvested datasets on it,
  and the id survives a slug change. Dates are typed (`xsd:date` or `xsd:dateTime` after their
  shape), `frequency` maps to the EU frequency vocabulary (`continuous` → `UPDATE_CONT`), topics to
  `dcat:theme` concepts, `spatial` and `bbox` to a `dct:Location` with a WKT `dcat:bbox`, the owner
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

The output conforms to the official DCAT-AP 3.0 SHACL shapes (`dcat-ap-SHACL.ttl` of the SEMIC
release) under RDFS inference; without inference only `rdfs:Resource` checks on plain URLs fail.

## Known gaps

- `dct:license` holds the license URL as entered: data.gouv.fr matches it against its own license
  list (URLs and known alternate URLs), an unknown URL ends as "license not specified".
- No `dct:language`, no EU data-theme vocabulary for `dcat:theme` (topics are free labels), no
  pagination (`hydra:PartialCollectionView`).
- The DCAT-US route keeps its historical defects (dates typed `xsd:date` with date-time values,
  `bytesSize` mapped to a non-existent `dcat:bytesSize`, no distribution for REST datasets).
