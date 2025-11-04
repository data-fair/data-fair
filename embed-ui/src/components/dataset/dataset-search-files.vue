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
    :items="results"
  >
    <template #default="{ item, index }">
      <v-row v-intersect:quiet="(intersect: boolean) => intersect && onScrollItem(index)">
        <v-col cols="12">
          <!-- attachment_url is empty if the value is an external link -->
          <h4><a :href="item.raw._attachment_url || item.raw[digitalDocumentField!.key]">{{ item.raw[digitalDocumentField!.key] }}</a></h4>
          <p
            class="text-body-1"
            v-html="item.raw._highlight['_file.content'].join('... ')"
          />
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

const { height } = defineProps({ height: { type: Number, required: true } })
const q = defineModel<string>('q', { default: '' })

const { digitalDocumentField } = useDatasetStore()

const cols = computed(() => [digitalDocumentField.value!.key, '_file.content_type', '_file.content_length', '_attachment_url'])
const extraParams = computed(() => ({
  select: cols.value.join(','),
  highlight: '_file.content',
  qs: `_exists_:${digitalDocumentField.value?.key}`
}))
const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })
const pageSize = 10
const { baseFetchUrl, total, results, fetchResults } = useLines('list', pageSize, cols, q, '', extraParams, undefined)

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

const virtualScroll = ref<VVirtualScroll>()
</script>

<style lang="less">
  .search-results {
    .highlighted {
      font-weight: bold;
    }
  }
</style>
