<template>
  <v-table
    density="compact"
    class="border rounded"
  >
    <thead>
      <tr>
        <th style="width: 20%">
          {{ t('field') }}
        </th>
        <th style="width: 40%">
          {{ t('source', { lang: defaultLocale.toUpperCase() }) }}
        </th>
        <th>{{ t('translation', { lang: locale.toUpperCase() }) }}</th>
      </tr>
    </thead>
    <tbody>
      <template
        v-for="group of groups"
        :key="group.title"
      >
        <tr v-if="group.title">
          <td
            colspan="3"
            class="text-title-small bg-surface-light"
          >
            {{ group.title }}
          </td>
        </tr>
        <tr
          v-for="row of group.rows"
          :key="row.id"
        >
          <td class="text-medium-emphasis">
            {{ row.field }}
          </td>
          <td>{{ row.source }}</td>
          <td class="py-1">
            <v-text-field
              :model-value="row.value"
              :placeholder="row.source"
              :class="{ 'i18n-missing': !row.value }"
              variant="outlined"
              density="compact"
              hide-details
              @update:model-value="v => emit('update', row.id, v)"
            />
          </td>
        </tr>
      </template>
    </tbody>
  </v-table>
</template>

<i18n lang="yaml">
fr:
  field: Champ
  source: "Texte source ({lang})"
  translation: "Traduction ({lang})"
en:
  field: Field
  source: "Source text ({lang})"
  translation: "Translation ({lang})"
</i18n>

<script setup lang="ts">
// MOCKUP i18n: translations of the owner settings texts, one row per source text
export type I18nRow = { id: string, field: string, source: string, value?: string }

defineProps<{
  groups: { title?: string, rows: I18nRow[] }[]
  locale: string
  defaultLocale: string
}>()
const emit = defineEmits<{ update: [id: string, value: string] }>()
const { t } = useI18n()
</script>
