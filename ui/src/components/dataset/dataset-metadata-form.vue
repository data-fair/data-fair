<template>
  <div v-if="dataset">
    <v-select
      v-model="dataset.license"
      :items="licensesFetch.data.value ?? []"
      :disabled="!can('writeDescription')"
      item-title="title"
      item-value="href"
      :label="t('licence')"
      return-object
      hide-details
      class="mb-3"
      clearable
    />

    <v-select
      v-if="topicsFetch.data.value?.length"
      v-model="dataset.topics"
      :items="topicsFetch.data.value ?? []"
      :disabled="!can('writeDescription')"
      item-title="title"
      item-value="id"
      :label="t('topics')"
      multiple
      return-object
      hide-details
      class="mb-3"
    />

    <v-combobox
      v-model="dataset.keywords"
      :disabled="!can('writeDescription')"
      :label="t('keywords')"
      hide-details
      multiple
      chips
      closable-chips
      class="mb-3"
    />

    <v-text-field
      v-model="dataset.origin"
      :disabled="!can('writeDescription')"
      :label="t('origin')"
      hide-details
      class="mb-3"
      clearable
    />

    <v-text-field
      v-model="dataset.image"
      :disabled="!can('writeDescription')"
      :label="t('image')"
      hide-details
      class="mb-3"
      clearable
    />

    <!-- Conditional metadata fields based on owner settings -->
    <v-text-field
      v-if="datasetsMetadata?.projection?.active"
      v-model="dataset.projection"
      :disabled="!can('writeDescription')"
      :label="datasetsMetadata.projection.title || t('projection')"
      hide-details
      class="mb-3"
      clearable
    />

    <v-text-field
      v-if="datasetsMetadata?.creator?.active"
      v-model="dataset.creator"
      :disabled="!can('writeDescription')"
      :label="datasetsMetadata.creator.title || t('creator')"
      hide-details
      class="mb-3"
      clearable
      :rules="props.required.includes('creator') ? [(val: string) => !!val] : []"
    />

    <v-select
      v-if="datasetsMetadata?.frequency?.active"
      v-model="dataset.frequency"
      :items="frequencies"
      :disabled="!can('writeDescription')"
      :label="datasetsMetadata.frequency.title || t('frequency')"
      hide-details
      clearable
      class="mb-3"
    />

    <v-text-field
      v-if="datasetsMetadata?.spatial?.active"
      v-model="dataset.spatial"
      :disabled="!can('writeDescription')"
      :label="datasetsMetadata.spatial.title || t('spatial')"
      hide-details
      class="mb-3"
      clearable
    />

    <v-text-field
      v-if="datasetsMetadata?.temporal?.active"
      :model-value="formatTemporal(dataset.temporal)"
      readonly
      :label="datasetsMetadata.temporal.title || t('temporal')"
      hide-details
      class="mb-3"
      clearable
      @click:clear="dataset.temporal = null"
    >
      <template #append-inner>
        <v-menu
          v-model="temporalMenu"
          :close-on-content-click="false"
        >
          <template #activator="{ props: menuProps }">
            <v-icon
              :icon="mdiCalendar"
              v-bind="menuProps"
            />
          </template>
          <v-date-picker
            :model-value="temporalDates"
            multiple
            @update:model-value="setTemporalDates"
          />
        </v-menu>
      </template>
    </v-text-field>

    <v-text-field
      v-if="datasetsMetadata?.modified?.active"
      :model-value="dataset.modified ? formatDate(dataset.modified) : ''"
      readonly
      :label="datasetsMetadata.modified.title || t('modified')"
      hide-details
      class="mb-3"
      clearable
      @click:clear="dataset.modified = null"
    >
      <template #append-inner>
        <v-menu
          v-model="modifiedMenu"
          :close-on-content-click="false"
        >
          <template #activator="{ props: menuProps }">
            <v-icon
              :icon="mdiCalendar"
              v-bind="menuProps"
            />
          </template>
          <v-date-picker
            :model-value="dataset.modified ? [dataset.modified] : []"
            @update:model-value="dates => { dataset.modified = dates[0] || null; modifiedMenu = false }"
          />
        </v-menu>
      </template>
    </v-text-field>

    <v-checkbox
      v-if="dataset.schema?.some((prop: any) => prop['x-refersTo'] === 'http://schema.org/DigitalDocument')"
      v-model="dataset.attachmentsAsImage"
      :disabled="!can('writeDescriptionBreaking')"
      :label="t('attachmentsAsImage')"
      hide-details
      density="compact"
    />

    <template v-if="datasetsMetadata?.custom?.length">
      <v-text-field
        v-for="cm of datasetsMetadata.custom"
        :key="cm.key"
        :model-value="dataset.customMetadata?.[cm.key]"
        :disabled="!can('writeDescription')"
        :label="cm.title"
        hide-details
        class="mb-3"
        clearable
        @update:model-value="v => setCustomMetadata(cm.key, v)"
      />
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  licence: Licence
  topics: Thematiques
  origin: Provenance
  image: Adresse d'une image utilisee comme vignette
  keywords: Mots cles
  projection: Système de coordonnées
  creator: Producteur
  frequency: Fréquence de mise à jour
  freq_realtime: Temps réel
  freq_daily: Quotidienne
  freq_weekly: Hebdomadaire
  freq_monthly: Mensuelle
  freq_quarterly: Trimestrielle
  freq_yearly: Annuelle
  freq_irregular: Irrégulière
  spatial: Couverture spatiale
  temporal: Couverture temporelle
  modified: Date de modification de la source
  attachmentsAsImage: Afficher les pièces jointes comme des images
en:
  licence: License
  topics: Topics
  origin: Origin
  image: URL of an image used as thumbnail
  keywords: Keywords
  projection: Coordinate reference system
  creator: Producer
  frequency: Update frequency
  freq_realtime: Real-time
  freq_daily: Daily
  freq_weekly: Weekly
  freq_monthly: Monthly
  freq_quarterly: Quarterly
  freq_yearly: Yearly
  freq_irregular: Irregular
  spatial: Spatial coverage
  temporal: Temporal coverage
  modified: Source modification date
  attachmentsAsImage: Display attachments as images
</i18n>

<script lang="ts" setup>
import { mdiCalendar } from '@mdi/js'
import { useDatasetsMetadata } from '~/composables/dataset/use-metadata'

const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const props = withDefaults(defineProps<{
  required?: string[]
}>(), { required: () => [] })

const owner = computed(() => dataset.value?.owner)
const licensesFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/licenses` : null)
const topicsFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/topics` : null)

const { datasetsMetadata } = useDatasetsMetadata(owner)

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value)
}

const frequencyKeys = ['realtime', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'irregular'] as const
const frequencies = computed(() => frequencyKeys.map(k => ({ title: t(`freq_${k}`), value: k })))

const temporalMenu = ref(false)
const modifiedMenu = ref(false)

const temporalDates = computed(() => {
  if (!dataset.value?.temporal) return []
  return [dataset.value.temporal.start, dataset.value.temporal.end].filter(Boolean)
})

const formatTemporal = (temporal: any) => {
  if (!temporal) return ''
  const parts = []
  if (temporal.start) parts.push(formatDate(temporal.start))
  if (temporal.end) parts.push(formatDate(temporal.end))
  return parts.join(' — ')
}

const setTemporalDates = (dates: string[]) => {
  if (!dates.length) { dataset.value.temporal = null; return }
  const sorted = [...dates].sort()
  dataset.value.temporal = { start: sorted[0], end: sorted[sorted.length - 1] }
}

const setCustomMetadata = (key: string, value: any) => {
  if (!dataset.value.customMetadata) dataset.value.customMetadata = {}
  if (value) dataset.value.customMetadata[key] = value
  else delete dataset.value.customMetadata[key]
}
</script>
