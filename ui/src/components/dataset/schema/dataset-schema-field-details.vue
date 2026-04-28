<template>
  <v-container v-if="field">
    <v-row density="compact">
      <v-col
        cols="12"
        sm="6"
      >
        <div class="text-caption text-medium-emphasis">
          {{ t('title') }}
        </div>
        <div class="text-body-2">
          {{ field.title || field['x-originalName'] || field.key }}
        </div>
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
          {{ propTypeTitle(field, locale) }}<span
            v-if="field.format"
            class="text-medium-emphasis"
          > ({{ field.format }})</span>
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
        v-if="valueEntries.length"
        cols="12"
      >
        <div class="text-caption text-medium-emphasis mb-1">
          {{ t('values') }}
        </div>
        <div class="text-body-2">
          <template
            v-for="(entry, i) in valueEntries"
            :key="entry.value"
          >
            <span v-if="i > 0">&nbsp;—&nbsp;</span>
            <span>
              <template v-if="entry.label">{{ entry.label }} (<code>{{ entry.value }}</code>)</template>
              <code v-else>{{ entry.value }}</code>
            </span>
          </template>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Libellé
  originalName: Identifiant d'origine
  type: Type
  cardinality: Cardinalité
  concept: Concept
  description: Description
  display: Affichage
  capabilities: Capacités
  values: Valeurs
en:
  title: Title
  originalName: Original name
  type: Type
  cardinality: Cardinality
  concept: Concept
  description: Description
  display: Display
  capabilities: Capabilities
  values: Values
</i18n>

<script setup lang="ts">
import { propTypeTitle } from '~/utils/dataset'
import type { SchemaProperty } from '#api/types'

const { t, locale } = useI18n()
const { vocabulary } = useStore()

const props = defineProps<{
  field: SchemaProperty | null
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

const valueEntries = computed(() => {
  const field = props.field
  if (!field) return []
  const labels = (field['x-labels'] || {}) as Record<string, string>
  const fromEnum = Array.isArray(field.enum) ? field.enum.map(v => String(v)) : []
  const fromLabels = Object.keys(labels)
  const values = Array.from(new Set([...fromEnum, ...fromLabels]))
  return values.map(value => ({ value, label: labels[value] ?? '' }))
})
</script>
