<template>
  <div>
    <v-data-table
      v-if="!condensed"
      :headers="headers"
      :items="formats"
      hide-default-footer
      class="elevation-1"
    >
      <template
        slot="item"
        slot-scope="props"
      >
        <tr>
          <td>{{ props.item.type }}</td>
          <td>{{ $t(props.item.type.replace('/', '').replace(' ', '')) }}</td>
          <td>{{ props.item.format || '-' }}</td>
          <td>{{ props.item.formatsInArchive || '-' }}</td>
        </tr>
      </template>
    </v-data-table>
    <div v-else>
      {{ formats.map(f => f.type).join(', ') }}
    </div>
  </div>
</template>

<i18n lang="yaml">
fr:
  CSV: Format de fichier textuel pour données tabulaires dans lequel les valeurs sont séparées par des virgules
  TSV: Format de fichier textuel pour données tabulaires dans lequel les valeurs sont séparées par des tabulations
  OpenDocument: Format de fichier ouvert pour les applications bureautique de type tableur
  XLSX: Format de fichier tableur Office Open XML
  XLS: Format de fichier tableur Excel
  GeoJSON: Format de données géospatiales simples utilisant la norme JSON
  KMLKMZ: Format de données géospatiales basé sur le formalisme XML
  GPX: Format de fichier permettant l'échange de coordonnées GPS
  ESRIShapefile: Format de fichier pour les systèmes d'informations géographiques
  iCalendar: Format de données pour les échanges de données de calendrier
en:
  CSV: Textual file format for tabular data where values are separated by commas
  TSB: Textual file format for tabular data where values are separated by tabulations
  OpenDocument: Open file format for spreadsheet type office applications
  XLSX: Spreadsheet file format Office Open XML
  XLS: Excel spreadsheet file format
  GeoJSON: Format for simple geospatial data using the JSON standard
  KMLKMZ: Format for geospatial data using the XML standard
  GPX: File format for exchanging GPS coordinates
  ESRIShapefile: File format for geographic information systems
  iCalendar: File format for exchanging calendar contents
</i18n>

<script>
const { mapState } = require('vuex')

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
  },
  {
    type: 'XLSX',
    format: '.xlsx'
  }, {
    type: 'XLS',
    format: '.xls'
    // }, {
    //   type: 'DBF',
    //   description: `Format de fichier de base de données DBase`,
    //   format: '.dbf'
    // }, {
    //   type: 'TXT',
    //   description: `Format de fichier texte qui ne contient qu'une suite de caractères`,
    //   format: '.txt'
    // }, {
    //   type: 'DIF',
    //   description: `Format de fichier texte de données ASCII`,
    //   format: '.dif',
    //   formatsInArchive: ''
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
    description: 'Format de fichier pour les systèmes d\'informations géographiques',
    formatsInArchive: '.shp, .dbf, .shx (.prj optionel) dans une archive .zip'
  }, {
    type: 'iCalendar',
    format: '.ics'
  }
]

export default {
  props: ['condensed'],
  data: () => ({
    dialog: null,
    formats,
    headers: [
      { text: 'Type', sortable: false, value: 'type' },
      { text: 'Description', sortable: false, value: 'description' },
      { text: 'Format', sortable: false, value: 'format' },
      { text: 'Format archivé', sortable: false, value: 'formatsInArchive' }
    ]
  }),
  computed: {
    ...mapState(['env'])
  }
}

</script>
