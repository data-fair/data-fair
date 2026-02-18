# DCAT support

DCAT is supported both as an output format (API endpoint /catalog/dcat) and an input (catalogs/plugins/dcat.js). 

As an input we try to be compatible with any valid JSON-LD serialization of a DCAT catalog. Examples can be found in test-it/resources/dcat.

As an output we follow [these rules ](https://resources.data.gov/resources/dcat-us/). The ./schema directory contains a copy of their json schemas : https://resources.data.gov/schemas/dcat-us/v1.1/schema/catalog.json. A few rules were altered.