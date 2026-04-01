<template>
  <v-list-item
    :to="noLink ? undefined : `/application/${application.id}`"
    lines="two"
  >
    <v-list-item-title>
      {{ application.title || application.id }}
      <v-chip
        v-if="application.status === 'error'"
        size="x-small"
        color="error"
        variant="tonal"
        class="ml-1"
      >
        {{ t('error') }}
      </v-chip>
    </v-list-item-title>
    <v-list-item-subtitle>
      <span v-if="showOwner && application.owner">{{ ownerName }} · </span>
      <span v-if="application.status">{{ t('status.' + application.status) }} · </span>
      <span v-if="application.updatedAt">{{ formatDate(application.updatedAt) }}</span>
    </v-list-item-subtitle>
    <template
      v-if="showTopics && application.topics?.length"
      #append
    >
      <div class="d-flex ga-1">
        <v-chip
          v-for="topic in application.topics"
          :key="topic.id"
          size="x-small"
          :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}"
          variant="flat"
        >
          {{ topic.title }}
        </v-chip>
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import type { Application } from '#api/types'

const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  application: Application
  showTopics?: boolean
  showOwner?: boolean
  noLink?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
  noLink: false,
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
  error: Erreur
  status:
    running: En cours
    error: Erreur
    stopped: Arrêté
    configured: Configuré
en:
  error: Error
  status:
    running: Running
    error: Error
    stopped: Stopped
    configured: Configured
</i18n>
