<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-alert
      v-if="active && !valid"
      type="warning"
      variant="outlined"
      density="compact"
      class="mb-3"
    >
      {{ t('allZero') }}
    </v-alert>

    <v-form>
      <vjsf
        v-model="editCompleteness"
        :schema="settingsSchema.properties.metadataCompleteness"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<i18n lang="yaml">
fr:
  allZero: Au moins un critère doit avoir un poids supérieur à 0 pour que le score ait un sens.
en:
  allZero: At least one criterion must carry a weight above 0 for the score to mean anything.
</i18n>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const metadataCompleteness = defineModel<Settings['metadataCompleteness']>()
const valid = defineModel<boolean>('valid', { default: true })

const props = defineProps<{
  /** The sibling Metadata tab's options: a criterion whose field is not offered never counts. */
  datasetsMetadata?: Settings['datasetsMetadata']
  topics?: Settings['topics']
}>()

const editCompleteness = ref<Settings['metadataCompleteness']>()
watchDeepDiff(metadataCompleteness, () => {
  editCompleteness.value = metadataCompleteness.value
}, { immediate: true })
watchDeepDiff(editCompleteness, () => {
  metadataCompleteness.value = editCompleteness.value
}, {})

const { t, locale } = useI18n()

// Kept in step with api/src/datasets/utils/compute-completeness.ts
const DEFAULT_WEIGHTS: Record<string, number> = {
  description: 4,
  summary: 3,
  license: 3,
  keywords: 2,
  topics: 2,
  creator: 2,
  origin: 1,
  frequency: 1,
  spatial: 1,
  temporal: 1,
  conformsTo: 1
}
const GATED_BY_METADATA = ['keywords', 'creator', 'frequency', 'spatial', 'temporal', 'conformsTo'] as const

const active = computed(() => !!editCompleteness.value?.active)

const weightOf = (key: string) => (editCompleteness.value?.weights as any)?.[key] ?? DEFAULT_WEIGHTS[key]

/** Which gated criteria have their field offered, the others being unable to count for anything. */
const offeredCriteria = computed(() => {
  const offered: Record<string, boolean> = {}
  for (const key of GATED_BY_METADATA) offered[key] = !!(props.datasetsMetadata as any)?.[key]?.active
  offered.topics = !!props.topics?.length
  return offered
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value,
  // read by the `if` expressions of the gated weights: a criterion whose field is not offered is
  // not rendered at all, rather than shown alongside a warning that it does nothing
  context: { offeredCriteria: offeredCriteria.value }
}))

/**
 * The denominator has to have something in it. Only applicable criteria count, so weighting nothing
 * but criteria whose field is not offered is just as empty as weighting nothing at all.
 */
const applicableWeight = computed(() => Object.keys(DEFAULT_WEIGHTS)
  .filter(key => offeredCriteria.value[key] !== false)
  .reduce((sum, key) => sum + weightOf(key), 0))

watch([active, applicableWeight], () => {
  valid.value = !active.value || applicableWeight.value > 0
}, { immediate: true })
</script>
