<template>
  <v-data-table
    :headers="headers"
    :items="formats"
    density="compact"
    :items-per-page="-1"
  >
    <template #item.description="{ item }">
      {{ t(item.type.replace('/', '').replace(' ', '')) }}
    </template>
    <template #item.format="{ item }">
      {{ item.format || '-' }}
    </template>
    <template #item.formatsInArchive="{ item }">
      {{ item.formatsInArchive || '-' }}
    </template>
    <template #bottom />
  </v-data-table>
</template>

<i18n lang="yaml">
fr:
  type: Type
  description: Description
  format: Format
  formatsInArchive: Format archivé
  CSV: Format de fichier textuel pour données tabulaires dans lequel les valeurs sont séparées par des virgules
  TSV: Format de fichier textuel pour données tabulaires dans lequel les valeurs sont séparées par des tabulations
  OpenDocument: Format de fichier ouvert pour les applications bureautique de type tableur
  XLSX: Format de fichier tableur Office Open XML
  XLS: Format de fichier tableur Excel
  JSON: Données tabulaires au format JSON
  GeoJSON: Format de données géospatiales simples utilisant la norme JSON
  KMLKMZ: Format de données géospatiales basé sur le formalisme XML
  GPX: Format de fichier permettant l'échange de coordonnées GPS
  ESRIShapefile: Format de fichier pour les systèmes d'informations géographiques
  Mapinfo: Archive ZIP de fichiers Mapinfo
  iCalendar: Format de données pour les échanges de données de calendrier
en:
  type: Type
  description: Description
  format: Format
  formatsInArchive: Archived format
  CSV: Textual file format for tabular data where values are separated by commas
  TSV: Textual file format for tabular data where values are separated by tabulations
  OpenDocument: Open file format for spreadsheet type office applications
  XLSX: Spreadsheet file format Office Open XML
  XLS: Excel spreadsheet file format
  JSON: Tabular data in JSON format
  GeoJSON: Format for simple geospatial data using the JSON standard
  KMLKMZ: Format for geospatial data using the XML standard
  GPX: File format for exchanging GPS coordinates
  ESRIShapefile: File format for geographic information systems
  Mapinfo: MapInfo ZIP archive files
  iCalendar: File format for exchanging calendar contents
</i18n>

<script setup lang="ts">
const { t } = useI18n()

const formats = [
  {
    type: 'CSV',
    format: '.csv',
    formatsInArchive: '.csv.gz ou .csv seul dans une archive .zip'
  }, {
    type: 'TSV',
    format: '.tsv',
    formatsInArchive: '.tsv.gz ou .tsv seul dans une archive .zip'
  }, {
    type: 'OpenDocument',
    format: '.ods, .fods'
  }, {
    type: 'XLSX',
    format: '.xlsx'
  }, {
    type: 'XLS',
    format: '.xls'
  }, {
    type: 'JSON',
    format: '.json, .ndjson'
  }, {
    type: 'GeoJSON',
    format: '.geojson',
    formatsInArchive: '.geojson.gz ou .geojson seul dans une archive .zip'
  }, {
    type: 'KML/KMZ',
    format: '.kml, .kmz'
  }, {
    type: 'GPX',
    format: '.gpx'
  }, {
    type: 'ESRI Shapefile',
    formatsInArchive: '.shp, .dbf, .shx (.prj optionel) dans une archive .zip'
  }, {
    type: 'Mapinfo',
    formatsInArchive: '.map, .tab, .id .dat dans une archive .zip'
  }, {
    type: 'iCalendar',
    format: '.ics'
  }
]

const headers = [
  { title: t('type'), key: 'type', sortable: false },
  { title: t('description'), key: 'description', sortable: false },
  { title: t('format'), key: 'format', sortable: false },
  { title: t('formatsInArchive'), key: 'formatsInArchive', sortable: false }
]
</script>
