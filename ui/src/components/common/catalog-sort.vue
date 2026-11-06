<template>
  <v-tooltip
    :disabled="!disabled"
    :text="t('sortDisabledRelevance')"
    location="bottom"
  >
    <template #activator="{ props: tooltipProps }">
      <div
        v-bind="tooltipProps"
        class="mt-4 mx-4"
        :class="{ 'cursor-not-allowed': disabled }"
      >
        <v-select
          :model-value="field"
          :label="t('sort')"
          :items="items"
          :disabled="disabled"
          rounded="md"
          hide-details
          @update:model-value="sort = `${$event}:${order}`"
        />
        <v-btn-toggle
          :model-value="order"
          :disabled="disabled"
          variant="outlined"
          rounded="md"
          density="comfortable"
          class="w-100 mt-2"
          divided
          mandatory
          @update:model-value="sort = `${field}:${$event}`"
        >
          <v-btn
            value="-1"
            :icon="mdiSortDescending"
            :title="t('descending')"
            class="flex-grow-1"
          />
          <v-btn
            value="1"
            :icon="mdiSortAscending"
            :title="t('ascending')"
            class="flex-grow-1"
          />
        </v-btn-toggle>
      </div>
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
import { mdiSortAscending, mdiSortDescending } from '@mdi/js'

defineProps<{
  items: { title: string, value: string }[]
  disabled?: boolean
}>()

// "field:order", as the API takes it
const sort = defineModel<string>({ required: true })
const field = computed(() => sort.value.split(':')[0])
const order = computed(() => sort.value.split(':')[1] ?? '1')

const { t } = useI18n()
</script>

<i18n lang="yaml">
fr:
  sort: Trier par
  ascending: Ordre croissant
  descending: Ordre décroissant
  sortDisabledRelevance: "Tri désactivé pendant une recherche : les résultats sont triés par pertinence"
en:
  sort: Sort by
  ascending: Ascending order
  descending: Descending order
  sortDisabledRelevance: "Sorting is disabled during a search: results are sorted by relevance"
</i18n>
