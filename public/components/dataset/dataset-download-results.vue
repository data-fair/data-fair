<template>
  <v-menu
    v-model="menu"
    offset-y
    tile
    :close-on-content-click="false"
  >
    <template #activator="{ on }">
      <v-btn
        color="primary"
        icon
        large
        :title="$t('downloadTitle')"
        v-on="on"
      >
        <v-icon>mdi-download</v-icon>
      </v-btn>
    </template>
    <v-sheet>
      <v-alert
        v-t="'alert1'"
        type="info"
        :value="true"
        tile
        text
        :icon="false"
        class="mb-0 mt-1"
      />
      <v-list
        v-if="total > 10000"
        class="py-0"
        dense
        style="position:relative"
      >
        <v-list-item
          target="download"
          :disabled="largeCsvLoading"
          @click="downloadLargeCSV"
        >
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-file-delimited-outline
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title v-t="'csv'" />
        </v-list-item>
        <v-btn
          v-if="largeCsvLoading"
          icon
          :title="$t('cancel')"
          color="warning"
          absolute
          right
          style="position:absolute;top:6px;right:8px;"
          @click="cancelLargeCsv"
        >
          <v-icon>mdi-cancel</v-icon>
        </v-btn>
        <div style="height:4px;width:100%;">
          <v-progress-linear
            v-if="largeCsvLoading"
            :buffer-value="largeCsvBufferValue"
            :value="largeCsvValue"
            stream
            height="4"
            style="margin:0;"
          />
        </div>
      </v-list>
      <v-alert
        v-t="'alert2'"
        type="warning"
        :value="total > 10000"
        tile
        dense
        text
        :icon="false"
        class="my-0"
      />
      <v-list
        class="pt-0"
        dense
      >
        <v-list-item
          v-if="total <= 10000"
          :href="downloadUrls.csv"
          target="download"
          @click="clickDownload('csv')"
        >
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-file-delimited-outline
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title v-t="'csv'" />
        </v-list-item>
        <v-list-item
          :href="downloadUrls.xlsx"
          target="download"
          @click="clickDownload('xlsx')"
        >
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-microsoft-excel
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title v-t="'xlsx'" />
        </v-list-item>
        <v-list-item
          :href="downloadUrls.ods"
          target="download"
          @click="clickDownload('ods')"
        >
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-file-table-outline
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title v-t="'ods'" />
        </v-list-item>
        <v-list-item
          v-if="dataset.bbox"
          :href="downloadUrls.geojson"
          target="download"
          @click="clickDownload('geojson')"
        >
          <v-list-item-avatar :size="30">
            <v-avatar :size="30">
              <v-icon>
                mdi-map
              </v-icon>
            </v-avatar>
          </v-list-item-avatar>
          <v-list-item-title v-t="'geojson'" />
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

<script>
import { mapState, mapGetters } from 'vuex'
import buildURL from 'axios/lib/helpers/buildURL'
import streamSaver from 'streamsaver'
import eventBus from '~/event-bus'
const LinkHeader = require('http-link-header')

export default {
  props: ['params', 'total'],
  data () {
    return {
      menu: false,
      largeCsvLoading: false,
      largeCsvBufferValue: 0,
      largeCsvValue: 0,
      largeCsvCancelled: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    downloadUrls () {
      const params = {
        ...this.params,
        size: 10000,
        page: 1
      }
      delete params.truncate
      return {
        csv: buildURL(this.resourceUrl + '/lines', { ...params, format: 'csv' }),
        xlsx: buildURL(this.resourceUrl + '/lines', { ...params, format: 'xlsx' }),
        ods: buildURL(this.resourceUrl + '/lines', { ...params, format: 'ods' }),
        geojson: buildURL(this.resourceUrl + '/lines', { ...params, format: 'geojson' })
      }
    }
  },
  methods: {
    async downloadLargeCSV () {
      this.largeCsvCancelled = false
      this.largeCsvLoading = true
      try {
        const { WritableStream } = await import('web-streams-polyfill/ponyfill')
        streamSaver.WritableStream = WritableStream
        streamSaver.mitm = `${this.env.publicUrl}/streamsaver/mitm.html`
        this.fileStream = streamSaver.createWriteStream(`${this.dataset.id}.csv`)
        this.writer = this.fileStream.getWriter()
        const nbChunks = Math.ceil(this.total / 10000)
        let nextUrl = this.downloadUrls.csv
        for (let chunk = 0; chunk < nbChunks; chunk++) {
          if (this.largeCsvCancelled) break
          this.largeCsvBufferValue = ((chunk + 1) / nbChunks) * 100
          let res
          try {
            res = await this.$axios.get(nextUrl)
          } catch (err) {
            // 1 retry after 10s for network resilience, short service interruption, etc
            await new Promise(resolve => setTimeout(resolve, 10000))
            res = await this.$axios.get(nextUrl)
          }

          const { data, headers } = res
          if (headers.link) {
            const next = new URL(LinkHeader.parse(headers.link).rel('next')[0].uri)
            next.searchParams.set('header', false)
            nextUrl = next.href
          }
          await this.writer.write(new TextEncoder().encode(data))
          this.largeCsvValue = ((chunk + 1) / nbChunks) * 100
        }
        if (!this.largeCsvCancelled) {
          this.writer.close()
          this.clickDownload('csv')
        }
      } catch (error) {
        if (!this.largeCsvCancelled && !!error) {
          console.log('download large csv error', error)
          eventBus.$emit('notification', { error })
        }
      }
      this.largeCsvLoading = false
      this.largeCsvCancelled = false
      this.largeCsvBufferValue = 0
      this.largeCsvValue = 0
    },
    /* cancel works, but the next download stays in pending state I don't know why */
    async cancelLargeCsv () {
      this.largeCsvCancelled = true
      if (this.writer) {
        this.writer.releaseLock()
        this.fileStream.abort()
      }
    },
    clickDownload (format) {
      parent.postMessage({ trackEvent: { action: 'download_filtered', label: `${this.dataset.id} - ${format}` } })
      this.menu = false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
