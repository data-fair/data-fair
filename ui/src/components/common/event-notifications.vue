<template>
  <d-frame :src="iframeUrl" />
</template>

<script setup lang="ts">
import { getResourceTopics, getResourceSender, type TopicResource } from './resource-topics'

const props = defineProps<{
  resource: TopicResource
  resourceType: 'dataset' | 'application'
}>()

const { locale } = useI18n()

const iframeUrl = computed(() => {
  const topics = getResourceTopics(props.resource, props.resourceType, 'notifications', locale.value)
  const searchParams = new URLSearchParams({
    key: topics.map(topic => topic.key).join(','),
    title: topics.map(topic => topic.title.replace(/,/g, ' ')).join(','),
    'url-template': `${$siteUrl}/data-fair/${props.resourceType}/${props.resource.id}`,
    sender: getResourceSender(props.resource),
    register: 'false'
  }).toString()

  return `${window.location.origin}/events/embed/subscribe?${searchParams}`
})
</script>
