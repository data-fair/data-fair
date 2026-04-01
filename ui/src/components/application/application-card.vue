<template>
  <v-card
    :to="`/application/${application.id}`"
    class="h-100 d-flex flex-column"
  >
    <v-card-item class="text-primary">
      <template #title>
        <span class="font-weight-bold">{{ application.title || application.id }}</span>
      </template>
      <template #append>
        <owner-avatar
          v-if="showOwner && application.owner"
          :owner="application.owner"
        />
      </template>
    </v-card-item>
    <v-divider />
    <v-card-text class="pa-0 flex-grow-1">
      <v-list
        density="compact"
        style="background-color: inherit;"
      >
        <v-list-item v-if="application.description">
          <span style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            {{ application.description }}
          </span>
        </v-list-item>
        <v-list-item v-if="application.status">
          <template #prepend>
            <v-icon
              :icon="statusIcon"
              :color="statusColor"
            />
          </template>
          {{ t('status.' + application.status) }}
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-subtitle class="text-body-small pb-3">
      <div
        v-if="showTopics && application.topics?.length"
        class="d-flex flex-wrap ga-1 mb-1"
      >
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
      <span v-if="application.updatedAt">{{ t('updatedAt', { date: formatDate(application.updatedAt) }) }}</span>
    </v-card-subtitle>
  </v-card>
</template>

<script setup lang="ts">
import type { Application } from '#api/types'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'
import { mdiPlay, mdiAlert, mdiStop, mdiCog } from '@mdi/js'

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

const statusIcon = computed(() => {
  const icons: Record<string, string> = {
    running: mdiPlay,
    error: mdiAlert,
    stopped: mdiStop,
    configured: mdiCog,
  }
  return (props.application.status && icons[props.application.status]) ?? mdiCog
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
