<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-alert
      v-if="ruleError"
      type="warning"
      variant="outlined"
      density="compact"
      class="mb-3"
    >
      {{ ruleError }}
    </v-alert>

    <!-- v-model like every sibling tab: without it a weight vjsf rejects (negative, non-integer)
         would leave the tab green and the Save button enabled, and the whole Quality section save
         — licences and private vocabulary included — would come back as a raw 400 -->
    <v-form v-model="formValid">
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
  allZero: Au moins un critère proposé doit avoir un poids supérieur à 0 pour que le score ait un sens.
  lengthRangeEmpty: "{title} : la longueur minimale ({min}) dépasse la longueur maximale ({max}), aucun texte ne peut satisfaire ce critère."
en:
  allZero: At least one offered criterion must carry a weight above 0 for the score to mean anything.
  lengthRangeEmpty: "{title}: the minimum length ({min}) is above the maximum ({max}), no text can satisfy this criterion."
</i18n>

<script setup lang="ts">
import { type Settings, settingsSchema, completenessGatedByMetadata } from '#api/types'
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

// The defaults are read straight off the schema vjsf renders below, and the gate list is the one
// the API scores on — both exported for that. A copy here would let this warning agree with itself
// while disagreeing with the score the API actually computes.
const weightsProperties = settingsSchema.properties.metadataCompleteness.properties.weights.properties as
  Record<string, { default: number }>
const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  Object.entries(weightsProperties).map(([key, prop]) => [key, prop.default])
)

const active = computed(() => !!editCompleteness.value?.active)

const weightOf = (key: string) => (editCompleteness.value?.weights as any)?.[key] ?? DEFAULT_WEIGHTS[key]

/** Which gated criteria have their field offered, the others being unable to count for anything. */
const offeredCriteria = computed(() => {
  const offered: Record<string, boolean> = {}
  for (const key of completenessGatedByMetadata) offered[key] = !!(props.datasetsMetadata as any)?.[key]?.active
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

/**
 * The two rules a JSON schema cannot express, so vjsf reddens no field for them. Stated here as a
 * sentence and refused again by the API (`validateMetadataCompleteness`), which is what a save from
 * anywhere else runs into.
 */
const ruleError = computed(() => {
  if (!active.value) return undefined
  for (const key of ['description', 'summary'] as const) {
    const { min, max } = editCompleteness.value?.[key] ?? {}
    if (min && max && min > max) {
      const title = settingsSchema.properties.metadataCompleteness.properties[key].title
      return t('lengthRangeEmpty', { title, min, max })
    }
  }
  if (!applicableWeight.value) return t('allZero')
  return undefined
})

/** vjsf's own field-level validity, and the cross-field rules it cannot see. */
// null while v-form has not validated anything yet, which is not a failure
const formValid = ref<boolean | null>(true)
watch([formValid, ruleError], () => {
  valid.value = formValid.value !== false && !ruleError.value
}, { immediate: true })
</script>
