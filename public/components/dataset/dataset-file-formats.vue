<template>
  <div>
    <v-data-table
      v-if="!condensed"
      :headers="headers"
      :items="formats"
      hide-default-footer
      class="elevation-1"
    >
      <template slot="items" slot-scope="props">
        <td>{{ props.item.type }}</td>
        <td>{{ props.item.description }}</td>
        <td>{{ props.item.format || '-' }}</td>
        <td>{{ props.item.formatsInArchive || '-' }}</td>
      </template>
    </v-data-table>
    <div v-else>
      {{ formats.map(f => f.type).join(', ') }}
    </div>
  </div>
</template>

<script>
  const { mapState } = require('vuex')

  const formats = [
    {
      type: 'CSV',
      description: 'Format de fichier de données tabulaires sous forme de valeurs séparées par des virgules',
      format: '.csv',
    }, {
      type: 'TSV',
      description: 'Format ouvert de texte représentant des données tabulaires sous forme de valeurs séparées par des tabulations',
      format: '.tsv',
    }, {
      type: 'OpenDocument',
      description: 'Format de fichier ouvert de données pour les applications bureautiques',
      format: '.ods, .fods',
    },
    {
      type: 'XLSX',
      description: 'Format de fichier tableur Office Open XML',
      format: '.xlsx',
    }, {
      type: 'XLS',
      description: 'Format de fichier tableur Excel',
      format: '.xls',
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
      description: 'Format de de fichier de données géospatiales simples utilisant la norme JSON',
      format: '.geojson',
      formatsInArchive: '',
    }, {
      type: 'KML/KMZ',
      description: 'Format destiné à la gestion de l\'affichage de données géospatiales basé sur le formalise XML',
      format: '.kml, .kmz',
    }, {
      type: 'GPX',
      description: 'Format de fichier permettant l\'échange de coordonnées GPS',
      format: '.gpx ou .xml',
    }, {
      type: 'ESRI Shapefile',
      description: 'Format de fichier pour les systèmes d\'informations géographiques',
      formatsInArchive: '.shp, .dbf et .shx (.prj optionel)',
    }, {
      type: 'iCalendar',
      description: 'Format de données pour les échanges de données de calendrier',
      formatsInArchive: '.ics',
    },
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
        { text: 'Format archivé (.zip)', sortable: false, value: 'formatsInArchive' },
      ],
    }),
    computed: {
      ...mapState(['env']),
    },
  }

</script>
