<template>
  <v-tooltip
    v-model="tooltipOpen"
    :max-width="partOf ? 320 : undefined"
  >
    <template #activator="{props}">
      <v-icon
        :color="visibility === 'public' ? 'primary' : (partOf ? undefined : 'warning')"
        :size="size"
        v-bind="props"
      >
        {{ partOf ? mdiPuzzle : (visibility === 'public' ? mdiLockOpen : mdiLock) }}
      </v-icon>
    </template>
    <template v-if="partOf">
      <div>{{ t('fragmentOf.' + partOf.type, { title: parentFetch.data.value?.title ?? partOf.id }) }}</div>
      <div v-if="visibility">
        {{ t('visibility', { visibility: t(visibility) }) }}
      </div>
    </template>
    <template v-else>
      {{ t(visibility ?? 'private') }}
    </template>
  </v-tooltip>
</template>

<i18n lang="yaml">
fr:
  public: Public
  private: Privé
  protected: Protégé
  fragmentOf:
    dataset: "Fragment du jeu de données « {title} »"
    application: "Fragment de l'application « {title} »"
  visibility: "Visibilité : {visibility}"
en:
  public: Public
  private: Private
  protected: Protected
  fragmentOf:
    dataset: "Fragment of the dataset \"{title}\""
    application: "Fragment of the application \"{title}\""
  visibility: "Visibility: {visibility}"
</i18n>

<script setup lang="ts">
import { mdiLockOpen, mdiLock, mdiPuzzle } from '@mdi/js'

const { partOf } = defineProps<{
  visibility?: 'public' | 'private' | 'protected'
  // a fragment shows the puzzle icon of fragment-info instead of the lock, its visibility moves to the tooltip
  partOf?: { type: 'dataset' | 'application', id: string }
  size?: string
}>()
const { t } = useI18n()

// the parent title is only fetched when the tooltip is first opened, not once per card of a list;
// notifError: false — whoever can read the fragment does not necessarily hold readDescription on its
// parent (see fragment-info), the parent id is shown instead
const tooltipOpen = ref(false)
const parentRequested = ref(false)
watch(tooltipOpen, (open) => { if (open) parentRequested.value = true })
const parentFetch = useFetch<{ title: string }>(() => partOf && parentRequested.value ? `${$apiPath}/${partOf.type}s/${partOf.id}` : null, { query: { select: 'title' }, notifError: false })
</script>
