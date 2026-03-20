<template>
  <div>
    <v-text-field
      :model-value="modelValue.spreadsheetWorksheetIndex"
      :label="t('worksheetIndex')"
      variant="outlined"
      density="compact"
      clearable
      placeholder="1"
      type="number"
      style="max-width: 500px;"
      class="mb-2"
      @update:model-value="update('spreadsheetWorksheetIndex', $event)"
    />
    <v-text-field
      :model-value="modelValue.spreadsheetHeaderLine"
      :label="t('headerLine')"
      variant="outlined"
      density="compact"
      clearable
      placeholder="1"
      type="number"
      style="max-width: 500px;"
      class="mb-2"
      @update:model-value="update('spreadsheetHeaderLine', $event)"
    />
    <v-text-field
      :model-value="modelValue.spreadsheetStartCol"
      :label="t('startCol')"
      variant="outlined"
      density="compact"
      clearable
      placeholder="1"
      type="number"
      style="max-width: 500px;"
      @update:model-value="update('spreadsheetStartCol', $event)"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  worksheetIndex: Numéro de la feuille
  headerLine: Numéro de ligne de l'entête
  startCol: Numéro de la 1ère colonne de données
en:
  worksheetIndex: Worksheet number
  headerLine: Header row number
  startCol: First data column number
</i18n>

<script lang="ts" setup>
const { t } = useI18n()

const modelValue = defineModel<Record<string, any>>({ default: () => ({}) })

function update (key: string, value: any) {
  const v = value === '' || value === null ? undefined : Number(value)
  const next = { ...modelValue.value }
  if (v === undefined) delete next[key]
  else next[key] = v
  modelValue.value = next
}
</script>
