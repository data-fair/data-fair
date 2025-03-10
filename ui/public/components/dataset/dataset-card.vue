<template>
  <v-card
    outlined
    tile
    hover
  >
    <nuxt-link
      :to="`/dataset/${dataset.id}`"
      style="text-decoration:none"
    >
      <v-card-title>
        <span
          class="font-weight-bold"
          style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;"
        >
          {{ dataset.title || dataset.id }}
        </span>
      </v-card-title>
      <v-divider />
      <v-card-text
        style="min-height: 96px;"
        class="pa-0"
      >
        <v-list dense>
          <v-list-item v-if="dataset.isVirtual">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-picture-in-picture-bottom-right-outline</v-icon>
            </v-list-item-avatar>
            <span v-t="'virtual'" />
          </v-list-item>
          <v-list-item v-if="dataset.isRest">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-all-inclusive</v-icon>
            </v-list-item-avatar>
            <span v-t="'inc'" />
          </v-list-item>
          <v-list-item
            v-if="dataset.file"
            style="overflow: hidden;"
          >
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon v-if="dataset.remoteFile">
                mdi-cloud-download
              </v-icon>
              <v-icon v-else>
                mdi-file
              </v-icon>
            </v-list-item-avatar>
            <span>{{ (dataset.originalFile || dataset.file).name | truncate(40,4) }} {{ (dataset.originalFile?.size || dataset.file?.size) | bytes($i18n.locale) }}</span>
          </v-list-item>
          <v-list-item
            v-else-if="dataset.draft && dataset.draft.file"
            style="overflow: hidden;"
          >
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-file</v-icon>
            </v-list-item-avatar>
            <span>{{ (dataset.draft.originalFile || dataset.draft.file).name | truncate(40,4) }} {{ (dataset.draft.originalFile?.size || dataset.draft.file?.size) | bytes($i18n.locale) }}</span>
          </v-list-item>
          <v-list-item v-if="dataset.draft && !dataset.file">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-progress-wrench</v-icon>
            </v-list-item-avatar>
            <span v-text="$t('draft')" />
          </v-list-item>
          <v-list-item v-if="dataset.count !== undefined">
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-view-headline</v-icon>
            </v-list-item-avatar>
            <span v-text="$tc('lines', dataset.count)" />
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-row
        v-if="showTopics"
        style="min-height:30px;"
      >
        <v-col class="pt-2 pb-2">
          <v-chip
            v-for="topic of dataset.topics"
            :key="topic.id"
            small
            outlined
            :color="$store.getters.contrastColor(topic.color) || 'default'"
            class="ml-2"
            style="font-weight: bold"
          >
            {{ topic.title }}
          </v-chip>
        </v-col>
      </v-row>
    </nuxt-link>
    <v-card-actions class="pl-3">
      <owner-short
        v-if="showOwner"
        :owner="dataset.owner"
        :ignore-department="true"
      />
      <owner-department
        v-if="showOwner || !activeAccount.department"
        :owner="dataset.owner"
      />
      <visibility :visibility="dataset.visibility" />
      <v-tooltip
        v-if="dataset.status === 'error'"
        top
      >
        <template #activator="{on}">
          <v-icon
            color="error"
            v-on="on"
          >
            mdi-alert
          </v-icon>
        </template>
        {{ $t('error') }}
      </v-tooltip>
      <v-spacer />
      <dataset-btn-table
        v-if="dataset.finalizedAt"
        :dataset="dataset"
      />
    </v-card-actions>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  virtual: Jeu de données virtuel
  inc: Jeu de données éditable
  lines: "aucune ligne | 1 ligne | {count} lignes"
  error: En erreur
  draft: brouillon
en:
  virtual: Virtual dataset
  inc: Editable dataset
  lines: "no line | 1 line | {count} lines"
  error: Error status
  draft: draft
</i18n>

<script>
import { mapGetters } from 'vuex'

export default {
  props: ['dataset', 'showTopics', 'showOwner'],
  computed: {
    ...mapGetters('session', ['activeAccount'])
  }
}
</script>

<style lang="css" scoped>
</style>
