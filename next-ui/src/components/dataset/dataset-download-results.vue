<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
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
          @click="downloadLargeCSV.execute()"
        >
          <template #prepend>
            <v-icon :icon="mdiFileDelimitedOutline" />
          </template>
          <v-list-item-title>
            {{ t('csv') }}
          </v-list-item-title>
        </v-list-item>
        <v-btn
          v-if="largeCsvLoading"
          :icon="mdiCancel"
          :title="t('cancel')"
          color="warning"
          absolute
          location="right"
          style="position:absolute;top:6px;right:8px;"
          @click="cancelLargeCsv"
        />
        <div style="height:4px;width:100%;">
          <v-progress-linear
            v-if="largeCsvLoading"
            :buffer-value="largeCsvBufferValue"
            :model-value="largeCsvValue"
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
        <v-list-item
          v-if="total <= pageSize"
          :href="downloadUrls.csv"
          target="download"
          @click="clickDownload('csv')"
        >
          <template #prepend>
            <v-icon :icon="mdiFileDelimitedOutline" />
          </template>
          <v-list-item-title>
            {{ t('csv') }}
          </v-list-item-title>
        </v-list-item>
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
  alert1: Ces téléchargements tiennent compte du tri et de la recherche
  alert2: Les formats suivants sont limités aux 10 000 premières lignes
  csv: format CSV
  xlsx: format XLSX
  ods: format ODS
  geojson: format GeoJSON
  cancel: Annuler
en:
  downloadTitle: Download results
  alert1: These downloads take into consideration the current filters and sorting
  alert2: The next formats are limited to the 10,000 first lines
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
const largeCsvBufferValue = ref(0)
const largeCsvValue = ref(0)
const largeCsvCancelled = ref(false)

const baseParams = computed(() => {
  const p: Record<string, any> = { size: pageSize, page: 1 }
  if (selectedCols.length) p.select = selectedCols.join(',')
  return p
})
const downloadUrls = computed(() => ({
  csv: withQuery(baseUrl, { ...baseParams.value, format: 'csv' }),
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
    for (let chunk = 0; chunk < nbChunks; chunk++) {
      if (largeCsvCancelled.value) break
      largeCsvBufferValue.value = ((chunk + 1) / nbChunks) * 100
      let res
      try {
        res = await $fetch.raw(nextUrl)
      } catch (err) {
        // 1 retry after 10s for network resilience, short service interruption, etc
        await new Promise(resolve => setTimeout(resolve, 10000))
        res = await $fetch.raw(nextUrl)
      }
      console.log('RES', res)
      const { _data, headers } = res
      const link = headers.get('link')
      if (link) {
        nextUrl = withQuery(LinkHeader.parse(link).rel('next')[0].uri, { header: 'false' })
      }
      await writer.write(new TextEncoder().encode(_data))
      largeCsvValue.value = ((chunk + 1) / nbChunks) * 100
    }
    if (!largeCsvCancelled.value) {
      writer.close()
      clickDownload('csv')
    }
  } catch (error) {
    if (!largeCsvCancelled.value && !!error) throw error
  }
  largeCsvLoading.value = false
  largeCsvCancelled.value = false
  largeCsvBufferValue.value = 0
  largeCsvValue.value = 0
  fileStream = null
  writer = null
})

const cancelLargeCsv = () => {
  largeCsvCancelled.value = true
  if (writer) writer.releaseLock()
  if (fileStream) fileStream.abort()
}

const clickDownload = (format: string) => {
  parent.postMessage({ trackEvent: { action: 'download_filtered', label: `${dataset.value?.slug} - ${format}` } })
  menu.value = false
}

</script>

<style lang="css" scoped>
</style>
