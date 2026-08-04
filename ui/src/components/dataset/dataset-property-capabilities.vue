<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-if="relevantCapabilities.length"
        v-bind="activatorProps"
        :title="t('technicalConfig')"
        :icon="mdiTune"
        variant="text"
        size="small"
      />
    </template>

    <v-card v-if="dialog">
      <v-toolbar
        :title="t('technicalConfig')"
        density="compact"
        flat
      >
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="dialog = false"
        />
      </v-toolbar>

      <v-card-text>
        <df-tutorial-alert
          id="capabilities"
          class="mb-2"
          persistent
        >
          <p>{{ t('tutorialCapabilities') }}</p>
          <p>{{ t('tutorialEnergy') }}</p>
        </df-tutorial-alert>

        <v-form>
          <v-switch
            v-if="textSearchKind !== 'none'"
            v-model="searchable"
            :disabled="!editable"
            :label="t('searchable')"
            color="primary"
            density="compact"
            hide-details
            class="mb-2"
          >
            <template #append>
              <help-tooltip :text="t('searchableHelp')" />
            </template>
          </v-switch>
          <v-select
            v-if="textSearchKind === 'language'"
            v-model="selectedLanguage"
            :disabled="!editable || !searchable"
            :items="languageItems"
            :label="t('language')"
            density="compact"
            class="mb-2"
            hide-details
          >
            <template #append>
              <help-tooltip :text="t('languageHelp')" />
            </template>
          </v-select>

          <vjsf
            v-if="editCapabilities"
            v-model="editCapabilities"
            :schema="schema"
            :options="vjsfOptions"
            @update:model-value="apply"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  technicalConfig: Configuration technique
  tutorialCapabilities: Par défaut la plupart des options sont cochées pour maximiser les utilisations possibles de vos jeux de données. Pour de petits volumes il n'y a pas d'inconvénient à conserver ce paramétrage. Mais pour des volumes importants désactiver les options inutiles permet de réduire les temps de traitement et de requête.
  tutorialEnergy: Qui dit temps de traitement dit énergie. En désactivant les options inutiles vous contribuez à rendre cette plateforme moins énergivore.
  searchable: Recherche textuelle
  searchableHelp: Désactivez cette capacité dans le cas d'un code, une url, etc. N'importe quel contenu sur lequel la recherche de mots a peu de sens.
  language: Langue
  languageHelp: Choisissez la langue utilisée pour l'analyse de la recherche textuelle de cette colonne, ou "Standard" pour une analyse sans langue particulière.
  languageFr: Français
  languageStandard: Standard (sans langue)
en:
  technicalConfig: Technical configuration
  tutorialCapabilities: Most options are active by default to maximize usage possibilities of your datasets. For small volumes of data there is no need to change this. But for larger datasets disabling some options will reduce processing and request times.
  tutorialEnergy: Processing time is synonymous to energy consumption. By disabling some options you contribute making this platform more energy efficient.
  searchable: Full text search
  searchableHelp: Disable this capability for content like a code, a url, etc. Any content for which searching words has little meaning.
  language: Language
  languageHelp: Choose the language used for text analysis of this column, or "Standard" for a language-less analysis.
  languageFr: French
  languageStandard: Standard (no language)
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import type { SchemaProperty } from '#api/types'
import { mdiClose, mdiTune } from '@mdi/js'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import capabilitiesSchema from '~/../../api/contract/capabilities.js'

const { t } = useI18n()

const props = defineProps<{
  property: SchemaProperty
  editable?: boolean
}>()

const capabilitiesProperties = capabilitiesSchema.properties as Record<string, { type: string, default: boolean, layout: string, title: string, description: string }>
const capabilitiesDefaultFalse = Object.keys(capabilitiesProperties).filter(
  (key: string) => capabilitiesProperties[key].default === false
)

const dialog = ref(false)
const editCapabilities = ref<Record<string, unknown> | null>(null)
// local state for the search toggle + language selector — kept OUT of editCapabilities so vjsf
// (whose schema no longer declares text/textStandard) never sees or reshapes these keys
const editSearchable = ref(true)
const editLanguage = ref<string | null>(null)
// the stored deprecated pair, kept verbatim so apply() can put back whatever this dialog does not
// itself express — a 'none' column (geometry / attachment) has no toggle at all, and a 'plain'
// column's toggle only ever expresses `textStandard`. Without this, opening the dialog and
// changing an unrelated capability would silently drop those stored values (and trigger a
// full reindex).
const storedTextCapabilities = ref<{ text?: unknown, textStandard?: unknown }>({})

// A plain string column (no format, or the uri-reference format) is the only kind that carries a
// `language` meta and materializes a language-analyzed field — mirrors resolveSearchField's
// isPlainString in api/src/datasets/es/operations.ts.
const isPlainString = computed(() =>
  props.property.type === 'string' && (!props.property.format || props.property.format === 'uri-reference')
)

// Which text-search control to show for this column type:
// - 'language': the toggle + language selector (plain string columns)
// - 'plain': a bare toggle mapping to textStandard alone (legacy semantics, non-string columns
//   and other string subtypes like dates that never carry a language)
// - 'none': no text-search capability at all for this column type (geometry, attachments)
const textSearchKind = computed<'language' | 'plain' | 'none'>(() => {
  const type = props.property.type
  if (props.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return 'none'
  if (props.property['x-refersTo'] === 'http://schema.org/DigitalDocument') return 'none'
  if (type === 'number' || type === 'integer' || type === 'boolean') return 'plain'
  if (type === 'string') return isPlainString.value ? 'language' : 'plain'
  return 'none'
})

const relevantCapabilities = computed(() => {
  const type = props.property.type
  if (type === 'number' || type === 'integer') {
    return ['index', 'values']
  } else if (type === 'boolean') {
    return ['index', 'values']
  } else if (type === 'string' && (props.property.format === 'date' || props.property.format === 'date-time')) {
    return ['index', 'values']
  } else if (props.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
    return ['geoShape', 'vtPrepare']
  } else if (props.property['x-refersTo'] === 'http://schema.org/DigitalDocument') {
    return ['indexAttachment']
  } else if (type === 'string') {
    return ['index', 'textAgg', 'values', 'insensitive', 'wildcard']
  }
  return []
})

const schema = computed(() => {
  const s = JSON.parse(JSON.stringify(capabilitiesSchema))
  Object.keys(s.properties).forEach((key: string) => {
    if (!relevantCapabilities.value.includes(key)) delete s.properties[key]
  })
  return s
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  disableAll: !props.editable,
  density: 'compact'
}))

const languageItems = computed(() => [
  { value: 'fr', title: t('languageFr') },
  { value: null, title: t('languageStandard') }
])

watch(dialog, (show) => {
  if (show) {
    const capabilities = props.property['x-capabilities'] ? { ...props.property['x-capabilities'] } as Record<string, unknown> : {}
    // read-back mirrors the API's resolution (resolveSearchField): any-of gate for the toggle on a
    // column that can carry a language, `textStandard` ALONE for a 'plain' column — such a column
    // never materializes a `.text` field, so `text` is meaningless there and a stored
    // `{textStandard: false}` (exactly what the previous UI wrote for these types) really means
    // "not searchable". Using the any-of gate here read it back as ON while the API resolved OFF.
    const textOn = capabilities.text !== false
    const standardOn = capabilities.textStandard !== false
    editSearchable.value = textSearchKind.value === 'plain' ? standardOn : (textOn || standardOn)
    editLanguage.value = (isPlainString.value && textOn) ? ((props.property.language as string | undefined) ?? null) : null
    storedTextCapabilities.value = { text: capabilities.text, textStandard: capabilities.textStandard }
    delete capabilities.text
    delete capabilities.textStandard
    editCapabilities.value = capabilities
  } else {
    editCapabilities.value = null
  }
})

// searchable mirrors editSearchable, set on dialog open per the read-back rule above (line ~206):
// the any-of gate (`text !== false || textStandard !== false`) for columns that can carry a
// `language`, but `textStandard !== false` ALONE for a 'plain' column, since such a column never
// materializes a `.text` field and the any-of gate would misread a stored `{textStandard: false}`
// as searchable.
const searchable = computed<boolean>({
  get: () => editSearchable.value,
  set: (value: boolean) => {
    editSearchable.value = value
    apply()
  }
})

const selectedLanguage = computed<string | null>({
  get: () => editLanguage.value,
  set: (value: string | null) => {
    editLanguage.value = value
    apply()
  }
})

function apply () {
  if (!editCapabilities.value) return
  const capabilities = { ...editCapabilities.value }

  // serialization per spec §5.4: off -> text:false, textStandard:false, no language;
  // on + language L -> language: L, deprecated keys absent; on + standard -> text: false only
  if (textSearchKind.value === 'none') {
    // no toggle is shown for these columns — put the stored pair back untouched rather than
    // dropping it (see storedTextCapabilities)
    if (storedTextCapabilities.value.text !== undefined) capabilities.text = storedTextCapabilities.value.text
    if (storedTextCapabilities.value.textStandard !== undefined) capabilities.textStandard = storedTextCapabilities.value.textStandard
  } else if (textSearchKind.value === 'plain') {
    if (!editSearchable.value) capabilities.textStandard = false
    // `text` has no meaning on a column that never materializes `.text`, but it is stored state we
    // did not ask about — keep it so an unrelated edit doesn't rewrite the schema for nothing
    if (storedTextCapabilities.value.text !== undefined) capabilities.text = storedTextCapabilities.value.text
  } else if (textSearchKind.value === 'language') {
    if (!editSearchable.value) {
      capabilities.text = false
      capabilities.textStandard = false
    } else if (!editLanguage.value) {
      capabilities.text = false
    }
    const language = editSearchable.value ? editLanguage.value : null
    if (language) props.property.language = language
    else delete props.property.language
  }

  // we only keep the values that were toggled away from defaults
  for (const key in capabilities) {
    if (capabilities[key] === true && !capabilitiesDefaultFalse.includes(key)) delete capabilities[key]
  }
  for (const key in capabilities) {
    if (capabilities[key] === false && capabilitiesDefaultFalse.includes(key)) delete capabilities[key]
  }
  if (Object.keys(capabilities).length) {
    props.property['x-capabilities'] = capabilities
  } else {
    delete props.property['x-capabilities']
  }
}
</script>
