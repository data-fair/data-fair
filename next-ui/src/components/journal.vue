<template>
  <v-list />
</template>

<script lang="ts" setup>
import type { Event } from '#api/types'
import eventsJson from '#shared/events.json'
const eventsList = eventsJson as Record<string, Record<string, { icon: string, text: Record<string, string>, color?: string }>>

const session = useSession()

const { journal, type } = defineProps<{
  journal: Record<string, Event>[]
  type: 'dataset' | 'application'
}>()

const eventTypes = eventsList[type]
const draftEventTypes = eventsList[`${type}-draft`]

const events = computed(journal.filter(event => !!eventTypes[event.type]))

const eventLabel = (item: Event) => {
  const eventType = getEventType(item)
  return eventType.text[session.lang.value] || eventType.text[session.lang.value]
}

const getEventType = (item: Event) => {
  return (item.draft && draftEventTypes?.[item.type]) ? draftEventTypes[item.type] : eventTypes[item.type]
}

</script>
