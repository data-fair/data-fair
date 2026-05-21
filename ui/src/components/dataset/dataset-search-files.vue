<template>
  <v-toolbar
    density="compact"
    color="background"
    flat
  >
    <dataset-nb-results
      unit="files"
      :total="total"
      :limit="0"
      style="min-width:80px;max-width:80px;"
      class="ml-2"
    />
    <search-field v-model="q" />
  </v-toolbar>
  <v-virtual-scroll
    ref="virtualScroll"
    :height="height - 48"
    :items="results"
  >
    <template #default="{ item, index }">
      <div
        v-intersect:quiet="(intersect: boolean) => intersect && onScrollItem(index)"
        class="pt-4 px-3"
      >
        <!-- attachment_url is empty if the value is an external link -->
        <a
          :href="item.raw._attachment_url || item.raw[digitalDocumentField!.key]"
          :title="downloadTitle(item)"
          target="_blank"
          rel="noopener"
        >{{ filename(item) }}</a>
        <span
          v-if="item.raw['_file.content_length']"
          class="text-caption text-medium-emphasis ml-2"
        >— {{ formatBytes(item.raw['_file.content_length'], locale) }}</span>
        <p
          v-if="showPath(item)"
          class="text-caption text-medium-emphasis font-italic mb-0"
          style="word-break:break-all;"
        >
          {{ item.raw[digitalDocumentField!.key] }}
        </p>
      </div>
    </template>
  </v-virtual-scroll>
</template>

<script setup lang="ts">
import type { VVirtualScroll } from 'vuetify/components'
import type { ExtendedResult } from '../../composables/dataset/lines'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'

const { height } = defineProps({ height: { type: Number, required: true } })
const q = defineModel<string>('q', { default: '' })

const { digitalDocumentField } = useDatasetStore()
const { t, locale } = useI18n()

const indexAttachment = computed(() => digitalDocumentField.value?.['x-capabilities']?.indexAttachment !== false)
const cols = computed(() => {
  const c = [digitalDocumentField.value!.key, '_attachment_url']
  if (indexAttachment.value) c.push('_file.content_length')
  return c
})
const extraParams = computed(() => ({
  select: cols.value.join(','),
  qs: `_exists_:${digitalDocumentField.value?.key}`
}))

const filename = (item: ExtendedResult) => {
  if (item.raw._attachment_url) {
    return decodeURIComponent(new URL(item.raw._attachment_url).pathname.split('/').pop() ?? '')
  }
  return item.raw[digitalDocumentField.value!.key]?.split('/').pop() ?? ''
}

// REST single-line uploads produce technical paths of the form
// `{lineId}/{md5-hex}/{filename}` — hide those, they carry no user-meaningful info.
const technicalPathRe = /^[^/]+\/[0-9a-f]{32}\/[^/]+$/
const showPath = (item: ExtendedResult) => {
  const p = item.raw[digitalDocumentField.value!.key]
  if (!p || typeof p !== 'string') return false
  if (!p.includes('/')) return false
  return !technicalPathRe.test(p)
}

const downloadTitle = (item: ExtendedResult) => {
  const name = filename(item)
  const size = item.raw['_file.content_length']
  if (size) return t('downloadWithSize', { name, size: formatBytes(size, locale.value) })
  return t('download', { name })
}
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

<i18n lang="yaml">
fr:
  download: "Télécharger {name} (nouvelle fenêtre)"
  downloadWithSize: "Télécharger {name} — {size} (nouvelle fenêtre)"
en:
  download: "Download {name} (new window)"
  downloadWithSize: "Download {name} — {size} (new window)"
</i18n>
