<template>
  <workflow-update-dataset :dataset-params="{publicationSites: $route.query.publicationSite, owner: $route.query.owner}" />
</template>

<script>
export default {
  layout: 'embed',
  middleware: ['auth-required']
}
</script>
