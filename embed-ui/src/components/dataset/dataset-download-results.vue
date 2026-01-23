<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    max-width="300"
  >
    <template #activator="{ props }">
      <v-btn
        color="primary"
        icon
        size="large"
        :title="t('downloadTitle')"
        v-bind="props"
      >
        <v-icon :icon="mdiDownload" />
      </v-btn>
    </template>
    <v-sheet>
      <v-alert
        type="info"
        tile
        variant="text"
        :icon="false"
        class="mb-0 mt-1"
      >
        {{ t('alert1') }}
      </v-alert>
      <v-list
        v-if="total > pageSize"
        class="py-0"
        density="compact"
        style="position:relative"
      >
        <v-list-item
          target="download"
          :disabled="largeCsvLoading"
          @click="showCsvOptions = !showCsvOptions"
        >
          <template #prepend>
            <v-icon :icon="mdiFileDelimitedOutline" />
          </template>
          <v-list-item-title>
            {{ t('csv') }}
          </v-list-item-title>
        </v-list-item>
        <dataset-download-csv-options
          v-if="showCsvOptions"
          v-model:csv-sep="csvSep"
          @click="downloadLargeCSV.execute()"
        />
        <v-btn
          v-if="largeCsvLoading"
          :icon="mdiCancel"
          :title="t('cancel')"
          color="warning"
          density="compact"
          style="position:absolute;top:6px;right:8px;"
          @click="cancelLargeCsv"
        />
        <div style="height:4px;width:100%;">
          <v-progress-linear
            v-if="largeCsvLoading"
            :buffer-value="largeCsvBufferProgress"
            :model-value="largeCsvProgress"
            stream
            height="4"
            style="margin:0;"
          />
        </div>
      </v-list>
      <v-alert
        v-if="total > pageSize"
        type="warning"
        tile
        density="compact"
        variant="text"
        :icon="false"
        class="my-0"
      >
        {{ t('alert2') }}
      </v-alert>

      <v-list
        class="pt-0"
        density="compact"
      >
        <template v-if="total <= pageSize">
          <v-list-item
            target="download"
            @click="showCsvOptions = !showCsvOptions"
          >
            <template #prepend>
              <v-icon :icon="mdiFileDelimitedOutline" />
            </template>
            <v-list-item-title>
              {{ t('csv') }}
            </v-list-item-title>
          </v-list-item>
          <dataset-download-csv-options
            v-if="showCsvOptions"
            v-model:csv-sep="csvSep"
            :href="downloadUrls.csv"
            @click="clickDownload('csv')"
          />
        </template>

        <v-list-item
          :href="downloadUrls.xlsx"
          target="download"
          @click="clickDownload('xlsx')"
        >
          <template #prepend>
            <v-icon :icon="mdiMicrosoftExcel" />
          </template>
          <v-list-item-title>
            {{ t('xlsx') }}
          </v-list-item-title>
        </v-list-item>
        <v-list-item
          :href="downloadUrls.ods"
          target="download"
          @click="clickDownload('ods')"
        >
          <template #prepend>
            <v-icon :icon="mdiFileTableOutline" />
          </template>
          <v-list-item-title>
            {{ t('ods') }}
          </v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="dataset?.bbox"
          :href="downloadUrls.geojson"
          target="download"
          @click="clickDownload('geojson')"
        >
          <template #prepend>
            <v-icon :icon="mdiMap" />
          </template>
          <v-list-item-title>
            {{ t('geojson') }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-sheet>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  downloadTitle: Télécharger les résultats
  alert1: Ces téléchargements tiennent compte du tri et de la recherche.
  alert2: Les formats suivants sont limités aux 10 000 premières lignes.
  csv: format CSV
  xlsx: format XLSX
  ods: format ODS
  geojson: format GeoJSON
  cancel: Annuler
en:
  downloadTitle: Download results
  alert1: These downloads take into consideration the current filters and sorting.
  alert2: The next formats are limited to the 10,000 first lines.
  csv: CSV format
  xlsx: XLSX format
  ods: ODS format
  geojson: GeoJSON format
  cancel: Cancel
</i18n>

<script setup lang="ts">
import streamSaver from 'streamsaver'
import LinkHeader from 'http-link-header'
import { withQuery } from 'ufo'
import { mdiFileDelimitedOutline, mdiFileTableOutline, mdiMicrosoftExcel, mdiMap, mdiDownload, mdiCancel } from '@mdi/js'
import debugModule from 'debug'

const debug = debugModule('download-results')

const pageSize = 10000

const { baseUrl, selectedCols, total } = defineProps({
  baseUrl: { type: String, required: true },
  selectedCols: { type: Array as () => String[], required: true },
  total: { type: Number, required: true }
})

const { t } = useI18n()
const { dataset } = useDatasetStore()

const menu = ref(false)
const largeCsvLoading = ref(false)
const largeCsvBufferProgress = ref(0)
const largeCsvProgress = ref(0)
const largeCsvCancelled = ref(false)
const showCsvOptions = ref(false)
const csvSep = ref(',')

const baseParams = computed(() => {
  const p: Record<string, any> = { size: pageSize, page: 1, truncate: undefined }
  if (selectedCols.length) p.select = selectedCols.join(',')
  return p
})
const downloadUrls = computed(() => ({
  csv: withQuery(baseUrl, { ...baseParams.value, format: 'csv', sep: csvSep.value }),
  xlsx: withQuery(baseUrl, { ...baseParams.value, format: 'xlsx' }),
  ods: withQuery(baseUrl, { ...baseParams.value, format: 'ods' }),
  geojson: withQuery(baseUrl, { ...baseParams.value, format: 'geojson' })
}))

let fileStream: WritableStream | null = null
let writer: WritableStreamDefaultWriter | null = null
const downloadLargeCSV = useAsyncAction(async () => {
  largeCsvCancelled.value = false
  largeCsvLoading.value = true
  try {
    const { WritableStream } = await import('web-streams-polyfill/ponyfill')
    // @ts-ignore
    streamSaver.WritableStream = WritableStream
    streamSaver.mitm = `${$sitePath}/data-fair/streamsaver/mitm.html`
    fileStream = streamSaver.createWriteStream(`${dataset.value?.slug}.csv`)
    writer = fileStream.getWriter()

    const nbChunks = Math.ceil(total / pageSize)
    let nextUrl = downloadUrls.value.csv
    let hasNext = true
    let chunk = 0
    debug(`start download, nbChunks=${nbChunks}`)
    while (hasNext && !largeCsvCancelled.value) {
      largeCsvBufferProgress.value = ((chunk + 1) / nbChunks) * 100
      debug('update progress', largeCsvBufferProgress.value)
      debug('fetch next chunk', nextUrl)
      const res = await $fetch.raw(nextUrl, {
        retry: 10,
        retryDelay: 2000
      })
      const { _data, headers } = res
      const linkHeader = headers.get('link')
      const parsedLinks = linkHeader ? LinkHeader.parse(linkHeader) : null
      const nextLink = parsedLinks?.rel('next')[0]
      if (nextLink) {
      // Ensure we don't repeat headers in subsequent chunks
        nextUrl = withQuery(nextLink.uri, { header: 'false' })
      } else {
        hasNext = false
      }

      debug('write data to stream')
      await writer.write(new TextEncoder().encode(_data))
      debug('data written')
      largeCsvProgress.value = ((chunk + 1) / nbChunks) * 100
      chunk += 1
    }
    if (!largeCsvCancelled.value) {
      clickDownload('csv')
    }
  } catch (error) {
    debug('download loop error', error)
    if (!largeCsvCancelled.value && !!error) throw error
  } finally {
    if (writer && !largeCsvCancelled.value) {
      await writer.close()
    }
    largeCsvLoading.value = false
    largeCsvCancelled.value = false
    largeCsvBufferProgress.value = 0
    largeCsvProgress.value = 0
  }
})

const cancelLargeCsv = () => {
  debug('cancel the download')
  largeCsvCancelled.value = true
  if (writer) {
    try { writer.releaseLock() } catch (err) {}
  }
  if (fileStream) {
    try { fileStream.abort() } catch (err) {}
  }
}

const clickDownload = (format: string) => {
  parent.postMessage({ trackEvent: { action: 'download_filtered', label: `${dataset.value?.slug} - ${format}` } })
  menu.value = false
}

</script>

<style lang="css" scoped>
</style>
