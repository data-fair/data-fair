<template>
  <d-frame :src="iframeUrl" />
</template>

<script setup lang="ts">
const props = defineProps<{
  resource: { id: string, slug?: string, title: string, owner: { type: string, id: string, department?: string } }
  resourceType: 'dataset' | 'application'
}>()

const eventsUrl = window.location.origin + '/events'

const iframeUrl = computed(() => {
  const keys = `data-fair:${props.resourceType}-data-updated:${props.resource.slug}`
  const titles = props.resource.title.replace(/,/g, ' ')
  let sender = `${props.resource.owner.type}:${props.resource.owner.id}`
  if (props.resource.owner.department) sender += ':' + props.resource.owner.department
  return `${eventsUrl}/embed/subscribe-webhooks?key=${encodeURIComponent(keys)}&title=${encodeURIComponent(titles)}&sender=${encodeURIComponent(sender)}`
})
</script>
