<template>
  <v-list-item style="min-height:40px;">
    <v-list-item-title>
      <nuxt-link :to="`/dataset/${dataset.id}`">
        {{ dataset.title || dataset.id }}
      </nuxt-link>
      <v-chip
        v-for="topic of dataset.topics"
        :key="topic.id"
        small
        outlined
        :color="topic.color || 'default'"
        class="ml-2"
        style="font-weight: bold"
      >
        {{ topic.title }}
      </v-chip>
    </v-list-item-title>
    <v-list-item-subtitle>
      <owner-short
        v-if="showOwner"
        :owner="dataset.owner"
      />
      <template v-if="dataset.isVirtual">
        <v-icon small style="margin-top:-3px;">
          mdi-picture-in-picture-bottom-right-outline
        </v-icon>
        <span v-t="'virtual'" />
      </template>

      <template v-if="dataset.isRest">
        <v-icon small style="margin-top:-3px;">
          mdi-all-inclusive
        </v-icon>
        <span v-t="'inc'" />
      </template>

      <template v-if="dataset.isMetaOnly">
        <v-icon small style="margin-top:-3px;">
          mdi-information-variant
        </v-icon>
        <span v-t="'metaOnly'" />
      </template>

      <template v-if="dataset.remoteFile || dataset.originalFile || dataset.file">
        <v-icon small style="margin-top:-3px;">
          mdi-file
        </v-icon>
        <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name | truncate(40,4) }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size) | displayBytes($i18n.locale) }}</span>
      </template>

      <template v-if="dataset.count !== undefined">
        -
        <span v-text="$tc('lines', dataset.count)" />
      </template>
    </v-list-item-subtitle>

    <v-list-item-action class="my-0">
      <v-tooltip v-if="dataset.status === 'error'" top>
        <template v-slot:activator="{on}">
          <v-icon color="error" v-on="on">
            mdi-alert
          </v-icon>
        </template>
        {{ $t('error') }}
      </v-tooltip>
    </v-list-item-action>
    <v-list-item-action class="my-0 ml-1">
      <visibility :visibility="dataset.visibility" />
    </v-list-item-action>
    <v-list-item-action class="my-0 ml-1">
      <dataset-btn-table :dataset="dataset" />
    </v-list-item-action>
  </v-list-item>
</template>

<i18n lang="yaml">
fr:
  virtual: jeu de données virtuel
  inc: jeu de données incrémental
  metaOnly: métadonnées seules
  lines: "aucune ligne | 1 ligne | {count} lignes"
  error: En erreur
en:
  virtual: virtual dataset
  inc: incremental dataset
  metaOnly: metadata only
  lines: "no line | 1 line | {count} lines"
  error: Error status
</i18n>

<script>
  const marked = require('marked/lib/marked')

  export default {
    props: ['dataset', 'showTopics', 'showOwner'],
    data: () => ({
      marked,
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
