<template>
  <d-frame :src="iframeUrl" />
</template>

<script setup lang="ts">
import settingsSchema from '../../../../api/types/settings/schema.js'

const props = defineProps<{
  // `integrity` rides along on a dataset: the integrity topics only exist for an enrolled one.
  // It is stripped from the API response for anyone without readIntegrity, so a user who cannot
  // see the verdict cannot subscribe to it either — the gate falls out of the projection.
  resource: { id: string, slug?: string, title: string, owner: { type: string, id: string, department?: string }, integrity?: { active?: boolean } }
  resourceType: 'dataset' | 'application'
}>()

const webhooksSchema = settingsSchema.properties.webhooks

const iframeUrl = computed(() => {
  const webhooks = webhooksSchema.items.properties.events.items.oneOf
    .filter((item: any) => {
      if (!item.const.startsWith(props.resourceType)) return false
      if (item.const === 'dataset-dataset-created') return false
      if (item.const === 'dataset-finalize-end') return false
      if (item.const === 'application-application-created') return false
      // only on a dataset that is actually enrolled: offering "integrity breached" on a dataset
      // with no integrity would be a subscription that can never fire
      if (item.const.startsWith('dataset-integrity-')) return !!props.resource.integrity?.active
      return true
    })
  const keysParam = webhooks.map((w: any) => `data-fair:${w.const}:${props.resource.slug}`).join(',')
  const titlesParam = webhooks.map((w: any) => w.title.replace(/,/g, ' ')).join(',')
  const urlTemplate = `${$siteUrl}/data-fair/${props.resourceType}/${props.resource.id}`
  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department
  const searchParams = new URLSearchParams({
    key: keysParam,
    title: titlesParam,
    'url-template': urlTemplate,
    sender,
    register: 'false'
  }).toString()
  return `${window.location.origin}/events/embed/subscribe?${searchParams}`
})
</script>
