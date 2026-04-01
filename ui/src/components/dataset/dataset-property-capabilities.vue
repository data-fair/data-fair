<!-- eslint-disable vue/no-mutating-props -- property is a reactive object from parent array, direct mutation is intentional -->
<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-if="relevantCapabilities.length"
        v-bind="activatorProps"
        icon
        size="small"
        variant="flat"
        :title="t('technicalConfig')"
      >
        <v-icon :icon="mdiTune" />
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('technicalConfig') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click="dialog = false"
        >
          <v-icon :icon="mdiClose" />
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3 pb-0">
        <v-alert
          type="info"
          variant="tonal"
          class="mb-4"
        >
          <p>{{ t('tutorialCapabilities') }}</p>
          <p class="mb-0">
            {{ t('tutorialEnergy') }}
          </p>
        </v-alert>

        <v-form>
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
en:
  technicalConfig: Technical configuration
  tutorialCapabilities: Most options are active by default to maximize usage possibilities of your datasets. For small volumes of data there is no need to change this. But for larger datasets disabling some options will reduce processing and request times.
  tutorialEnergy: Processing time is synonymous to energy consumption. By disabling some options you contribute making this platform more energy efficient.
</i18n>

<script setup lang="ts">
/* eslint-disable vue/no-mutating-props */
import { mdiClose, mdiTune } from '@mdi/js'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import capabilitiesSchema from '~/../../api/contract/capabilities.js'
import type { SchemaProperty } from '#api/types'

const { t } = useI18n({ useScope: 'local' })

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

const relevantCapabilities = computed(() => {
  const type = props.property.type
  if (type === 'number' || type === 'integer') {
    return ['index', 'textStandard', 'values']
  } else if (type === 'boolean') {
    return ['index', 'textStandard', 'values']
  } else if (type === 'string' && (props.property.format === 'date' || props.property.format === 'date-time')) {
    return ['index', 'textStandard', 'values']
  } else if (props.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') {
    return ['geoShape', 'vtPrepare']
  } else if (props.property['x-refersTo'] === 'http://schema.org/DigitalDocument') {
    return ['indexAttachment']
  } else if (type === 'string') {
    return ['index', 'text', 'textStandard', 'textAgg', 'values', 'insensitive', 'wildcard']
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
  disableAll: !props.editable
}))

watch(dialog, (show) => {
  if (show) {
    editCapabilities.value = props.property['x-capabilities'] ? { ...props.property['x-capabilities'] } : {}
  } else {
    editCapabilities.value = null
  }
})

function apply () {
  if (!editCapabilities.value) return
  const capabilities = { ...editCapabilities.value }
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
