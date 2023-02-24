<template>
  <workflow-update-dataset
    data-iframe-height
    :dataset-params="{publicationSites: $route.query.publicationSite, owner: $route.query.owner}"
    style="min-height:600px;"
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
