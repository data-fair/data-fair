<template>
  <workflow-update-dataset
    data-iframe-height
    :dataset-params="{publicationSites: $route.query.publicationSite, owner: $route.query.owner}"
  />
</template>

<script>
export default {
  layout: 'embed',
  middleware: ['auth-required']
}
</script>
