<template>
  <v-dialog
    :model-value="!!field"
    max-width="720"
    scrollable
    @update:model-value="(v) => { if (!v) emit('close') }"
  >
    <v-card v-if="field">
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>
          {{ field.title || field['x-originalName'] || field.key }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          variant="text"
          size="small"
          @click="emit('close')"
        />
      </v-toolbar>
      <v-card-text class="pa-4">
        <v-row density="compact">
          <v-col
            cols="12"
            sm="6"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('key') }}
            </div>
            <code class="text-body-2">{{ field.key }}</code>
          </v-col>
          <v-col
            v-if="field['x-originalName'] && field['x-originalName'] !== field.key"
            cols="12"
            sm="6"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('originalName') }}
            </div>
            <code class="text-body-2">{{ field['x-originalName'] }}</code>
          </v-col>
          <v-col
            cols="12"
            sm="6"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('type') }}
            </div>
            <div class="text-body-2">
              {{ propTypeTitle(field, locale) }}
              <span
                v-if="field.format"
                class="text-medium-emphasis"
              >
                ({{ field.format }})
              </span>
            </div>
          </v-col>
          <v-col
            v-if="typeof field['x-cardinality'] === 'number'"
            cols="12"
            sm="6"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('cardinality') }}
            </div>
            <div class="text-body-2">
              {{ field['x-cardinality'].toLocaleString() }}
            </div>
          </v-col>
          <v-col
            v-if="conceptTitle"
            cols="12"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('concept') }}
            </div>
            <div class="text-body-2">
              {{ conceptTitle }}
              <span
                v-if="field['x-refersTo']"
                class="text-medium-emphasis text-caption ml-1"
              >
                {{ field['x-refersTo'] }}
              </span>
            </div>
          </v-col>
          <v-col
            v-if="descriptionHtml"
            cols="12"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('description') }}
            </div>
            <p
              v-safe-html="descriptionHtml"
              class="text-body-2 mb-0"
            />
          </v-col>
          <v-col
            v-if="field['x-display']"
            cols="12"
            sm="6"
          >
            <div class="text-caption text-medium-emphasis">
              {{ t('display') }}
            </div>
            <div class="text-body-2">
              {{ field['x-display'] }}
            </div>
          </v-col>
          <v-col
            v-if="capabilityFlags.length"
            cols="12"
          >
            <div class="text-caption text-medium-emphasis mb-1">
              {{ t('capabilities') }}
            </div>
            <v-chip
              v-for="cap in capabilityFlags"
              :key="cap.name"
              :color="cap.enabled ? 'primary' : undefined"
              :variant="cap.enabled ? 'tonal' : 'outlined'"
              size="small"
              class="mr-1 mb-1"
            >
              {{ cap.name }}
            </v-chip>
          </v-col>
          <v-col
            v-if="valueRows.length"
            cols="12"
          >
            <div class="text-caption text-medium-emphasis mb-1">
              {{ t('values') }}
            </div>
            <v-data-table
              :headers="valueHeaders"
              :items="valueRows"
              :items-per-page="-1"
              density="compact"
              hide-default-footer
              class="border-thin rounded"
            >
              <template #item.value="{ item }">
                <code>{{ item.value }}</code>
              </template>
            </v-data-table>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  key: Clé
  originalName: Identifiant d'origine
  type: Type
  cardinality: Cardinalité
  concept: Concept
  description: Description
  display: Affichage
  capabilities: Capacités
  values: Valeurs
  value: Valeur
  label: Libellé
en:
  key: Key
  originalName: Original name
  type: Type
  cardinality: Cardinality
  concept: Concept
  description: Description
  display: Display
  capabilities: Capabilities
  values: Values
  value: Value
  label: Label
</i18n>

<script setup lang="ts">
import { mdiClose } from '@mdi/js'
import { propTypeTitle } from '~/utils/dataset'
import type { SchemaProperty } from '#api/types'

const { t, locale } = useI18n()
const { vocabulary } = useStore()

const props = defineProps<{
  field: SchemaProperty | null
}>()

const emit = defineEmits<{
  close: []
}>()

const conceptTitle = computed(() => {
  if (!props.field) return null
  const refersTo = props.field['x-refersTo']
  if (!refersTo) return null
  return vocabulary.value[refersTo]?.title ?? null
})

const descriptionHtml = computed(() => {
  if (!props.field) return null
  const refersTo = props.field['x-refersTo']
  return props.field.description || (refersTo && vocabulary.value[refersTo]?.description) || null
})

const capabilityFlags = computed(() => {
  const caps = props.field?.['x-capabilities']
  if (!caps) return []
  return Object.entries(caps).map(([name, value]) => ({ name, enabled: value !== false }))
})

const hasLabels = computed(() => {
  const labels = props.field?.['x-labels']
  return !!labels && Object.keys(labels).length > 0
})

const valueRows = computed(() => {
  const field = props.field
  if (!field) return []
  const labels = (field['x-labels'] || {}) as Record<string, string>
  const fromEnum = Array.isArray(field.enum) ? field.enum.map(v => String(v)) : []
  const fromLabels = Object.keys(labels)
  const values = Array.from(new Set([...fromEnum, ...fromLabels]))
  return values.map(value => ({ value, label: labels[value] ?? '' }))
})

const valueHeaders = computed(() => [
  { title: t('value'), key: 'value' },
  ...(hasLabels.value ? [{ title: t('label'), key: 'label' }] : [])
])
</script>
