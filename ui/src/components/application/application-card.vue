<template>
  <v-card
    :to="`/application/${application.id}`"
    class="w-100 h-100 d-flex flex-column"
  >
    <v-card-title class="text-body-1 font-weight-bold text-truncate">
      {{ application.title || application.id }}
    </v-card-title>
    <v-card-text class="flex-grow-1">
      <p
        v-if="application.description"
        class="text-body-2 text-medium-emphasis mb-2"
        style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
      >
        {{ application.description }}
      </p>
      <div class="d-flex flex-wrap ga-1">
        <v-chip v-if="application.status" size="x-small" :color="statusColor" variant="tonal">{{ t('status.' + application.status) }}</v-chip>
      </div>
      <div v-if="showTopics && application.topics?.length" class="d-flex flex-wrap ga-1 mt-2">
        <v-chip v-for="topic in application.topics" :key="topic.id" size="x-small" :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}" variant="flat">{{ topic.title }}</v-chip>
      </div>
    </v-card-text>
    <v-card-subtitle class="text-caption pb-3">
      <span v-if="showOwner && application.owner">{{ ownerName }} · </span>
      <span v-if="application.updatedAt">{{ t('updatedAt', { date: formatDate(application.updatedAt) }) }}</span>
    </v-card-subtitle>
  </v-card>
</template>

<script lang="ts" setup>
import type { Application } from '#api/types'

const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  application: Application
  showTopics?: boolean
  showOwner?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
})

const statusColor = computed(() => {
  const colors: Record<string, string> = {
    running: 'success',
    error: 'error',
    stopped: 'warning',
    configured: 'info',
  }
  return (props.application.status && colors[props.application.status]) ?? 'default'
})

const ownerName = computed(() => {
  const o = props.application.owner
  if (!o) return ''
  return o.departmentName || o.name || o.id
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  updatedAt: Mis à jour le {date}
  status:
    running: En cours
    error: Erreur
    stopped: Arrêté
    configured: Configuré
en:
  updatedAt: Updated on {date}
  status:
    running: Running
    error: Error
    stopped: Stopped
    configured: Configured
</i18n>
