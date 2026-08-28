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

    <!-- v-form like every sibling tab, so a value vjsf rejects blocks the whole Quality save -->
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

// defaults read off the schema, gate list shared with the API, so this warning can't drift from the score
const weightsProperties = settingsSchema.properties.metadataCompleteness.properties.weights.properties as
  Record<string, { default: number }>
const DEFAULT_WEIGHTS: Record<string, number> = Object.fromEntries(
  Object.entries(weightsProperties).map(([key, prop]) => [key, prop.default])
)

const active = computed(() => !!editCompleteness.value?.active)

const weightOf = (key: string) => (editCompleteness.value?.weights as any)?.[key] ?? DEFAULT_WEIGHTS[key]

// which gated criteria have their field offered; the others cannot count
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
  // read by the gated weights' `if`: an unoffered criterion is not rendered at all
  context: { offeredCriteria: offeredCriteria.value }
}))

// only applicable criteria count, so weighting only unoffered ones is as empty as weighting nothing.
// A custom metadata with a weight is always applicable — it is offered by being defined.
const applicableWeight = computed(() =>
  Object.keys(DEFAULT_WEIGHTS)
    .filter(key => offeredCriteria.value[key] !== false)
    .reduce((sum, key) => sum + weightOf(key), 0) +
  (props.datasetsMetadata?.custom ?? []).reduce((sum, custom) => sum + (custom.weight ?? 0), 0))

// the two cross-field rules vjsf can't redden a field for; also refused by the API on save
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

// null while v-form has not validated yet, which is not a failure
const formValid = ref<boolean | null>(true)
watch([formValid, ruleError], () => {
  valid.value = formValid.value !== false && !ruleError.value
}, { immediate: true })
</script>
