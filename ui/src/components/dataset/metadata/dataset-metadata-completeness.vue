<template>
  <v-menu
    v-if="score !== undefined"
    :close-on-content-click="false"
    location="bottom end"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        variant="text"
        class="mr-2"
        :title="t('title')"
      >
        <v-progress-circular
          :model-value="score"
          :color="scoreColor"
          size="24"
          width="3"
          class="mr-2"
          aria-hidden="true"
        />
        {{ score }} %
      </v-btn>
    </template>
    <v-card
      :title="t('title')"
      max-width="420"
    >
      <v-card-text class="pb-0">
        {{ t('help') }}
      </v-card-text>
      <v-list density="compact">
        <v-list-item
          v-for="criterion of criteria"
          :key="(criterion.custom ? 'custom.' : '') + criterion.key"
          :title="label(criterion)"
          :subtitle="hint(criterion)"
        >
          <template #prepend>
            <v-icon
              :icon="[mdiCloseCircle, mdiAlertCircle, mdiCheckCircle][criterion.note * 2]"
              :color="['error', 'warning', 'success'][criterion.note * 2]"
            />
          </template>
          <template #append>
            <span class="text-body-small ml-2">{{ t('weight', { weight: criterion.weight }) }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  title: Score de complétion des métadonnées
  help: Chaque métadonnée renseignée rapporte son poids, ou la moitié seulement si sa taille sort du minimum et du maximum recommandés.
  weight: 'Poids {weight}'
  empty: Non renseignée
  chars: 'aucun caractère | {n} caractère | {n} caractères'
  values: 'aucune valeur | {n} valeur | {n} valeurs'
  range: '{min} à {max} recommandés'
  min: 'au moins {min} recommandés'
  max: 'au plus {max} recommandés'
en:
  title: Metadata completeness score
  help: Each filled metadata earns its weight, or only half of it when its size is outside the recommended minimum and maximum.
  weight: 'Weight {weight}'
  empty: Not filled
  chars: 'no characters | {n} character | {n} characters'
  values: 'no values | {n} value | {n} values'
  range: '{min} to {max} recommended'
  min: 'at least {min} recommended'
  max: 'at most {max} recommended'
</i18n>

<script setup lang="ts">
import { mdiAlertCircle, mdiCheckCircle, mdiCloseCircle } from '@mdi/js'
import { completenessCriteria, computeCompleteness, type CompletenessCriterion } from '#api/types'
import datasetSchema from '~/../../api/types/dataset/schema.js'

const { dataset, datasetsMetadata } = defineProps<{
  dataset: Record<string, any>
  datasetsMetadata?: Record<string, any> | null
}>()

const { t, locale } = useI18n()

// computed on the edited dataset, so the score follows the form before it is saved
const score = computed(() => computeCompleteness(dataset, datasetsMetadata))
const criteria = computed(() => completenessCriteria(dataset, datasetsMetadata))
const scoreColor = computed(() => score.value! >= 75 ? 'success' : score.value! >= 50 ? 'warning' : 'error')

const label = (criterion: CompletenessCriterion) => {
  if (criterion.custom) return datasetsMetadata?.custom?.find((c: any) => c.key === criterion.key)?.title ?? criterion.key
  const prop = (datasetSchema as any).properties[criterion.key]
  return datasetsMetadata?.[criterion.key]?.title || prop?.['x-i18n-title']?.[locale.value] || prop?.title || criterion.key
}

const hint = (criterion: CompletenessCriterion) => {
  if (criterion.note === 0) return t('empty')
  const { size, recommendedMin: min, recommendedMax: max } = criterion
  if (size === undefined || (min === undefined && max === undefined)) return undefined
  const value = criterion.custom ? dataset.customMetadata?.[criterion.key] : dataset[criterion.key]
  const range = min !== undefined && max !== undefined ? t('range', { min, max }) : min !== undefined ? t('min', { min }) : t('max', { max })
  return `${t(Array.isArray(value) ? 'values' : 'chars', size)} · ${range}`
}
</script>
