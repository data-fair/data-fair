<template>
  <workflow-update-dataset
    data-iframe-height
    :dataset-params="{publicationSites: $route.query.publicationSite, owner: $route.query.owner}"
  />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {
  layout: 'embed',
  middleware: ['auth-required']
}
</script>
