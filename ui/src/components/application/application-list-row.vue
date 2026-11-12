<template>
  <!-- a row of the list mode of the applications page; selectors and sub-lists use the compact application-list-item -->
  <v-list-item
    :to="`/application/${application.id}`"
    lines="two"
    density="compact"
    class="application-list-row"
  >
    <template #prepend>
      <v-img
        :src="captureUrl"
        :aspect-ratio="1050 / 450"
        width="72"
        cover
        rounded
        class="border-sm mr-4 flex-grow-0"
      >
        <!-- the capture failed and there is no previous one: data-fair answers an error status -->
        <template #error>
          <div class="d-flex align-center justify-center fill-height bg-surface-light">
            <v-icon
              :icon="mdiImageOffOutline"
              size="small"
            />
          </div>
        </template>
      </v-img>
    </template>

    <v-list-item-title
      class="font-weight-bold"
      :title="application.title || application.id"
    >
      {{ application.title || application.id }}
    </v-list-item-title>
    <v-list-item-subtitle class="d-flex align-center flex-wrap ga-1 opacity-100">
      <template
        v-for="(part, i) in metaParts"
        :key="i"
      >
        <span v-if="i > 0">·</span>
        <span
          class="d-inline-flex align-center ga-1"
          :class="part.color && `text-${part.color}`"
        >
          <v-icon
            v-if="part.icon"
            :icon="part.icon"
            size="14"
          />
          {{ part.text }}
        </span>
      </template>
    </v-list-item-subtitle>

    <!-- columns of fixed width, aligned from one row to the next; a column empty on every row is left out -->
    <template #append>
      <div class="d-none d-md-flex align-center ga-4">
        <div
          v-if="columns.topics"
          class="d-flex align-center justify-end ga-1"
          style="width: 240px"
        >
          <topic-chip
            v-for="topic in shownTopics"
            :key="topic.id ?? topic.title"
            :topic="topic"
          />
          <span
            v-if="hiddenTopics.length"
            :title="hiddenTopics.map(topic => topic.title).join(', ')"
            class="text-label-medium"
          >+{{ hiddenTopics.length }}</span>
        </div>
        <div
          v-if="columns.owner"
          style="min-width: 28px"
        >
          <owner-avatar
            v-if="showOwner"
            :owner="application.owner"
            :omit-owner-name="!showAll"
          />
        </div>
        <!-- same hover card as the resource cards; a fragment keeps the puzzle icon naming its parent -->
        <div
          class="d-flex justify-center"
          style="width: 32px"
        >
          <resource-visibility
            v-if="application.partOf"
            :visibility="application.visibility"
            :part-of="application.partOf"
            size="small"
          />
          <card-visibility
            v-else-if="application.visibility"
            :visibility="application.visibility"
          />
        </div>
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import type { Application } from '#api/types'
import { mdiAlert, mdiImageOffOutline, mdiProgressWrench } from '@mdi/js'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

const { t, locale } = useI18n()
const session = useSession()
const showAll = useBooleanSearchParam('showAll')

const { application, columns = { topics: true, owner: true } } = defineProps<{
  application: Partial<Application> & Pick<Application, 'id' | 'title' | 'updatedAt' | 'owner'> & { visibility?: 'public' | 'private' | 'protected', thumbnail?: string }
  // the optional columns, decided by the page from all the displayed rows
  columns?: { topics: boolean, owner: boolean }
}>()

// same capture as the application card, so the browser cache serves both view modes
const captureUrl = computed(() => application.thumbnail || application.image || `${application.href}/capture?updatedAt=${application.updatedAt}`)

// same rule as the card: the department avatar when the list mixes departments
const showOwner = computed(() => showAll.value || !!(application.owner?.department && !session.state.account?.department))

const shownTopics = computed(() => application.topics?.slice(0, 2) ?? [])
const hiddenTopics = computed(() => application.topics?.slice(2) ?? [])

const metaParts = computed(() => {
  const parts: { icon?: string, text: string, color?: string }[] = []
  if (application.status === 'configured-draft') parts.push({ icon: mdiProgressWrench, text: t('draft'), color: 'warning' })
  if (application.status === 'error') parts.push({ icon: mdiAlert, text: t('error'), color: 'error' })
  if (application.updatedAt) parts.push({ text: t('updatedAt', { date: new Date(application.updatedAt).toLocaleDateString(locale.value) }) })
  return parts
})
</script>

<i18n lang="yaml">
fr:
  draft: Brouillon
  error: En erreur
  updatedAt: Modifiée le {date}
en:
  draft: Draft
  error: Error status
  updatedAt: Updated on {date}
</i18n>
