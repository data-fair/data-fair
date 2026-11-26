# DCAT support

DCAT is supported both as an output format (API endpoint /catalog/dcat) and an input (catalogs/plugins/dcat.js). 

As an input we try to be compatible with any valid JSON-LD serialization of a DCAT catalog. Examples can be found in test-it/resources/dcat.

As an output the `/catalog/dcat` endpoint serves DCAT-AP 3, cf docs/architecture/dcat-catalog.md.

The ./schema directory contains a copy of the DCAT-US json schemas (https://resources.data.gov/schemas/dcat-us/v1.1/schema/catalog.json), used to validate harvested catalogs. A few rules were altered.
