<template>
  <workflow-update-dataset
    v-model:updated="updated"
    data-iframe-height
    :dataset-params="datasetParams"
    style="min-height:600px;"
  />
</template>

<script lang="ts" setup>
const route = useRoute<'/embed/workflow/update-dataset'>()

const updated = useStringSearchParam('updated')

const datasetParams = computed(() => ({
  publicationSites: route.query.publicationSite as string | undefined,
  owner: route.query.owner as string | undefined
}))
</script>
