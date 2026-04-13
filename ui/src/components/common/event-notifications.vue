<template>
  <d-frame :src="iframeUrl" />
</template>

<script setup lang="ts">
import settingsSchema from '../../../../api/types/settings/schema.js'

const props = defineProps<{
  resource: { id: string, slug?: string, title: string, owner: { type: string, id: string, department?: string } }
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
