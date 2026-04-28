<template>
  <v-list-item
    :to="noLink ? undefined : `/application/${application.id}`"
    lines="two"
  >
    <template
      v-if="application.visibility"
      #prepend
    >
      <resource-visibility
        :visibility="application.visibility"
        class="mr-2"
        size="small"
      />
    </template>
    <v-list-item-title :title="application.title || application.id">
      {{ application.title || application.id }}
      <v-tooltip
        v-if="application.status === 'error'"
        :text="t('error')"
      >
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            :icon="mdiAlert"
            color="error"
            size="small"
            class="ml-1"
          />
        </template>
      </v-tooltip>
    </v-list-item-title>
    <v-list-item-subtitle v-if="subtitleParts.length">
      <template
        v-for="(part, i) in subtitleParts"
        :key="i"
      >
        <span v-if="i > 0"> · </span>
        <v-icon
          v-if="part.icon"
          :icon="part.icon"
          size="small"
          class="mr-1"
        />
        <span>{{ part.text }}</span>
      </template>
    </v-list-item-subtitle>
    <template
      v-if="showAppend"
      #append
    >
      <div class="d-flex align-center ga-2">
        <topic-chips
          v-if="showTopics && application.topics?.length"
          :topics="application.topics"
        />
        <owner-avatar
          v-if="showOwner && application.owner"
          :owner="application.owner"
          :omit-owner-name="!showAll"
        />
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import type { Application } from '#api/types'
import { mdiAlert } from '@mdi/js'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

type ListedApplication = Partial<Application> & Pick<Application, 'id'> & {
  title?: string
  visibility?: 'public' | 'private' | 'protected'
}

const { t, locale } = useI18n()
const showAll = useBooleanSearchParam('showAll')

const props = withDefaults(defineProps<{
  application: ListedApplication
  showTopics?: boolean
  showOwner?: boolean
  noLink?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
})

const subtitleParts = computed(() => {
  const parts: { icon?: string, text: string }[] = []
  if (props.application.status && props.application.status !== 'configured') {
    parts.push({ text: t('status.' + props.application.status) })
  }
  if (props.application.updatedAt) parts.push({ text: formatDate(props.application.updatedAt) })
  return parts
})

const showAppend = computed(() =>
  (props.showTopics && !!props.application.topics?.length) ||
  (props.showOwner && !!props.application.owner)
)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  error: En erreur
  status:
    created: Créée
    running: En cours
    error: Erreur
    stopped: Arrêté
    configured: Configuré
    configured-draft: Brouillon
en:
  error: Error status
  status:
    created: Created
    running: Running
    error: Error
    stopped: Stopped
    configured: Configured
    configured-draft: Draft
</i18n>
