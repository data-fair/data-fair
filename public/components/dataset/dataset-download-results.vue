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
      >
        <v-list-item
          target="download"
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
        class="mb-0 mt-1"
      />
      <v-list
        class="pt-0"
        dense
      >
        <v-list-item
          v-if="total <= 1000"
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
  alert1: Ces téléchargements tiennent compte du tri et de la recherche
  alert2: Les formats suivants sont limités aux 10 000 premières lignes
  csv: format CSV
  xlsx: format XLSX
  ods: format ODS
  geojson: format GeoJSON
en:
  alert1: These downloads take into consideration the current filters and sorting
  alert2: The next formats are limited to the 10,000 first lines
  csv: CSV format
  xlsx: XLSX format
  ods: ODS format
  geojson: GeoJSON format
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import buildURL from 'axios/lib/helpers/buildURL'
import streamSaver from 'streamsaver'
const LinkHeader = require('http-link-header')

export default {
  props: ['params', 'total'],
  data () {
    return {
      menu: true,
      largeCsvLoading: false,
      largeCsvBufferValue: 0,
      largeCsvValue: 0
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
      streamSaver.mitm = `${this.env.publicUrl}/streamsaver/mitm.html`

      const fileStream = streamSaver.createWriteStream(`${this.dataset.id}.csv`)
      const writer = fileStream.getWriter()
      this.largeCsvLoading = true
      const nbChunks = Math.ceil(this.total / 10000)
      let nextUrl = this.downloadUrls.csv
      for (let chunk = 0; chunk < nbChunks; chunk++) {
        this.largeCsvBufferValue = ((chunk + 1) / nbChunks) * 100
        const { data, headers } = await this.$axios.get(nextUrl)
        const next = new URL(LinkHeader.parse(headers.link).rel('next')[0].uri)
        next.searchParams.set('header', false)
        nextUrl = next.href
        writer.write(new TextEncoder().encode(data))
        this.largeCsvValue = ((chunk + 1) / nbChunks) * 100
      }
      writer.close()

      this.clickDownload('csv')
    },
    clickDownload (format) {
      parent.postMessage({ trackEvent: { action: 'download_filtered', label: `${this.dataset.id} - ${format}` } })
      this.menu = false
      this.largeCsvLoading = false
      this.largeCsvBufferValue = 0
      this.largeCsvValue = 0
    }
  }
}
</script>

<style lang="css" scoped>
</style>
