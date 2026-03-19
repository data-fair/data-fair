<!-- eslint-disable vue/no-v-html -->
<!-- eslint-disable vue/no-lone-template -->
<template>
  <v-toolbar
    flat
    density="compact"
    color="surface"
  >
    <dataset-nb-results
      :total="total"
      :limit="0"
      style="min-width:80px;max-width:80px;"
      class="ml-2"
    />
    <v-text-field
      v-model="editQ"
      placeholder="Rechercher"
      :append-inner-icon="mdiMagnify"
      variant="outlined"
      rounded
      color="primary"
      hide-details
      clearable
      density="compact"
      style="min-width:170px; max-width:250px;"
      class="mx-2"
      @keyup.enter="q = editQ"
      @click:append-inner="q = editQ"
      @click:clear="q = ''"
    />
  </v-toolbar>
  <v-virtual-scroll
    ref="virtualScroll"
    :height="height - 48"
    :items="rows"
  >
    <template #default="{ item: row, index: rowIndex }">
      <v-row no-gutters>
        <v-col
          v-for="(item, i) in row"
          :key="i"
          :style="`max-width:${colWidth}px;`"
          class="pa-4"
        >
          <v-card
            v-intersect:quiet="(intersect: boolean) => intersect && onScrollItem((rowIndex * rowSize) + i)"
            variant="outlined"
            :style="`max-width:${maxThumbnailWidth}px;`"
          >
            <v-img
              :src="item.raw._thumbnail"
              :height="thumbnailHeight"
              :cover="dataset?.thumbnails?.resizeMode !== 'fitIn'"
            />
            <v-card-title v-if="labelField">
              {{ item.raw[labelField.key] }}
            </v-card-title>
            <v-card-subtitle v-if="descriptionField">
              <template v-html="item.raw[descriptionField.key]" />
            </v-card-subtitle>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-virtual-scroll>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  lines: lignes
en:
  search: Search
  lines: lines
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import { type VVirtualScroll } from 'vuetify/components'
import { useElementSize } from '@vueuse/core'
import { ExtendedResult } from '~/composables/dataset-lines'

const { height } = defineProps({ height: { type: Number, required: true } })
const q = defineModel<string>('q', { default: '' })

const { dataset, descriptionField, labelField, imageField } = useDatasetStore()
const virtualScroll = ref<VVirtualScroll>()
const { width } = useElementSize(virtualScroll)
const maxThumbnailWidth = 300
const rowSize = computed(() => Math.max(1, Math.floor(width.value / maxThumbnailWidth)))
const colWidth = computed(() => Math.floor(width.value / rowSize.value))

const cols = computed(() => {
  const cols = []
  if (imageField.value) cols.push(imageField.value.key)
  if (labelField.value) cols.push(labelField.value.key)
  if (descriptionField.value) cols.push(descriptionField.value.key)
  return cols
})
const extraParams = computed(() => ({
  select: cols.value.join(','),
  thumbnail: `${maxThumbnailWidth}x${thumbnailHeight}`
}))
const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })
const pageSize = 4
const thumbnailHeight = 200
const { baseFetchUrl, total, results, fetchResults } = useLines('list', pageSize, cols, q, '', extraParams, undefined)

const rows = computed(() => {
  let i = 0
  const rows: ExtendedResult[][] = []
  while (i < results.value.length) {
    rows.push(results.value.slice(i, i + rowSize.value))
    i += rowSize.value
  }
  return rows
})

watch(baseFetchUrl, () => {
  if (!baseFetchUrl.value) return
  virtualScroll.value?.scrollToIndex(0)
})
const onScrollItem = async (index: number) => {
  // ignore scroll on deprecated items that will soon be replaced
  if (fetchResults.loading.value) return
  if (index === results.value.length - 1) {
    // scrolled until the current end of the table
    if (!fetchResults.loading.value) fetchResults.execute()
  }
}

</script>

<style lang="less">
  .search-results {
    .highlighted {
      font-weight: bold;
    }
  }
</style>
