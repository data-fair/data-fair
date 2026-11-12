<template>
  <!-- the score of a list row, with the metadata to fill first in a hover card; the full detail is in the metadata section -->
  <card-hover-info
    :title="t('title', { score: completeness.score })"
    end
  >
    <!-- mirrored so it fills counter-clockwise -->
    <v-progress-circular
      :model-value="completeness.score"
      :color="completeness.score >= 75 ? 'success' : completeness.score >= 50 ? 'warning' : 'error'"
      size="16"
      width="3"
      style="transform: scaleX(-1)"
    />
    <span>{{ completeness.score }}&nbsp;%</span>
    <template #help>
      <template v-if="todo.length">
        <div>{{ t('todo') }}</div>
        <div
          v-for="criterion of todo.slice(0, maxShown)"
          :key="(criterion.custom ? 'custom.' : '') + criterion.key"
          class="d-flex align-start ga-2 mt-1"
        >
          <v-icon
            :icon="criterion.note === 0 ? mdiCloseCircle : mdiAlertCircle"
            :color="criterion.note === 0 ? 'error' : 'warning'"
            size="16"
            class="flex-shrink-0"
            style="margin-top: 2px"
          />
          <span>{{ label(criterion) }} · {{ t(criterion.note === 0 ? 'empty' : 'outOfBounds') }}</span>
        </div>
        <div
          v-if="todo.length > maxShown"
          class="mt-1"
        >
          {{ t('more', todo.length - maxShown) }}
        </div>
      </template>
      <div v-else-if="completeness.criteria">
        {{ t('complete') }}
      </div>
      <div class="mt-2">
        {{ t('detail') }}
      </div>
    </template>
  </card-hover-info>
</template>

<script setup lang="ts">
import type { Completeness, CompletenessCriterion } from '#api/types'
import { mdiAlertCircle, mdiCloseCircle } from '@mdi/js'
import { localizedMetadata } from '~/utils/settings-metadata-form'

const { completeness, datasetsMetadata } = defineProps<{
  completeness: Pick<Completeness, 'score'> & Partial<Pick<Completeness, 'criteria'>>
  // settings of the current account, for the titles it gave to its metadata; another owner's custom keys stay raw
  datasetsMetadata?: Record<string, any> | null
}>()

const { t, locale } = useI18n()
const maxShown = 3

// what costs the most points first
const todo = computed(() => (completeness.criteria ?? [])
  .filter(criterion => criterion.note < 1)
  .sort((a, b) => b.weight * (1 - b.note) - a.weight * (1 - a.note)))

const metadataByKey = computed(() => localizedMetadata(locale.value))
const label = (criterion: CompletenessCriterion) => {
  if (criterion.custom) return datasetsMetadata?.custom?.find((c: any) => c.key === criterion.key)?.title ?? criterion.key
  return datasetsMetadata?.[criterion.key]?.title || metadataByKey.value[criterion.key]?.title || criterion.key
}
</script>

<i18n lang="yaml">
fr:
  title: 'Complétion des métadonnées : {score} %'
  todo: 'À compléter en priorité :'
  empty: non renseignée
  outOfBounds: hors de la taille recommandée
  more: 'et {n} autre à compléter | et {n} autres à compléter'
  complete: Toutes les métadonnées sont renseignées.
  detail: Détail complet dans la section Métadonnées du jeu de données.
en:
  title: 'Metadata completeness: {score} %'
  todo: 'To fill first:'
  empty: not filled
  outOfBounds: outside the recommended size
  more: 'and {n} other to fill | and {n} others to fill'
  complete: All the metadata are filled.
  detail: Full detail in the Metadata section of the dataset.
</i18n>
