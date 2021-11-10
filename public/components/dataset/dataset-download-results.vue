<template>
  <v-menu offset-y tile>
    <template v-slot:activator="{ on }">
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
        dense
        text
        :icon="false"
        class="mb-0 mt-1"
      />
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
      <v-list class="pt-0" dense>
        <v-list-item
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
  alert1: Ce téléchargement tient compte du tri et de la recherche
  alert2: Les résultats sont limités aux 10 000 premières lignes
  csv: format CSV
  xlsx: format XLSX
  ods: format ODS
  geojson: format GeoJSON
en:
  alert1: This download takes into consideration the current filters and sorting
  alert2: The results are limited to the 10,000 first lines
  csv: CSV format
  xlsx: XLSX format
  ods: ODS format
  geojson: GeoJSON format
</i18n>

<script>
  import { mapState, mapGetters } from 'vuex'
  import buildURL from 'axios/lib/helpers/buildURL'
  export default {
    props: ['params', 'total'],
    computed: {
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl']),
      downloadUrls() {
        const params = {
          ...this.params,
          size: 10000,
          page: 1,
        }
        delete params.truncate
        return {
          csv: buildURL(this.resourceUrl + '/lines', { ...params, format: 'csv' }),
          xlsx: buildURL(this.resourceUrl + '/lines', { ...params, format: 'xlsx' }),
          ods: buildURL(this.resourceUrl + '/lines', { ...params, format: 'ods' }),
          geojson: buildURL(this.resourceUrl + '/lines', { ...params, format: 'geojson' }),
        }
      },
    },
    methods: {
      clickDownload(format) {
        parent.postMessage({ trackEvent: { action: 'download_filtered', label: `${this.dataset.id} - ${format}` } })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
