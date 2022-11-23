<template>
  <v-list-item-subtitle>
    <owner-short
      v-if="showOwner"
      :owner="dataset.owner"
    />
    <template v-if="dataset.status === 'draft'">
      <v-icon
        small
        style="margin-top:-3px;"
      >
        mdi-progress-wrench
      </v-icon>
      <span v-t="'draft'" />
    </template>
    <template v-else-if="dataset.isVirtual">
      <v-icon
        small
        style="margin-top:-3px;"
      >
        mdi-picture-in-picture-bottom-right-outline
      </v-icon>
      <span v-t="'virtual'" />
    </template>

    <template v-else-if="dataset.isRest">
      <v-icon
        small
        style="margin-top:-3px;"
      >
        mdi-all-inclusive
      </v-icon>
      <span v-t="'inc'" />
    </template>

    <template v-else-if="dataset.isMetaOnly">
      <v-icon
        small
        style="margin-top:-3px;"
      >
        mdi-information-variant
      </v-icon>
      <span v-t="'metaOnly'" />
    </template>

    <template v-else-if="dataset.remoteFile || dataset.originalFile || dataset.file">
      <v-icon
        small
        style="margin-top:-3px;"
      >
        mdi-file
      </v-icon>
      <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name | truncate(40,4) }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size) | bytes($i18n.locale) }}</span>
    </template>

    <template v-if="dataset.count !== undefined">
      -
      <span v-text="$tc('lines', dataset.count)" />
    </template>
  </v-list-item-subtitle>
</template>

<i18n lang="yaml">
fr:
  virtual: jeu de données virtuel
  inc: jeu de données éditable
  metaOnly: métadonnées seules
  lines: "aucune ligne | 1 ligne | {count} lignes"
  draft: brouillon
en:
  virtual: virtual dataset
  inc: editable dataset
  metaOnly: metadata only
  lines: "no line | 1 line | {count} lines"
  draft: draft
</i18n>

<script>
export default {
  props: ['dataset', 'showOwner']
}
</script>

<style>

</style>
