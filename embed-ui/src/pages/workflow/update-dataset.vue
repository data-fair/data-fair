<template>
  <workflow-update-dataset
    v-model:updated="updated"
    data-iframe-height
    :dataset-params="datasetParams"
    style="min-height:600px;"
  />
</template>

<script lang="ts" setup>
useFrameContent()
const route = useRoute<'/workflow/update-dataset'>()
const { account } = useSessionAuthenticated()

const updated = useStringSearchParam('updated')
const owner = useStringSearchParam('owner')
const ownerFilter = computed(() => {
  if (owner.value) return owner.value
  let ownerFilter = `${account.value.type}:${account.value.id}`
  if (account.value.department) ownerFilter += ':' + account.value.department
  return ownerFilter
})

const datasetParams = computed(() => ({
  publicationSites: route.query.publicationSite as string | undefined,
  owner: ownerFilter.value
}))
</script>
