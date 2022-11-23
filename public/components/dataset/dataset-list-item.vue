<template>
  <v-list-item
    style="min-height:40px;"
    v-bind="listItemProps"
  >
    <v-list-item-content v-if="dense">
      <dataset-list-item-title
        :dataset="dataset"
        :show-topics="showTopics"
        :no-link="noLink"
      />
      <dataset-list-item-subtitle
        :dataset="dataset"
        :show-owner="showOwner"
      />
    </v-list-item-content>
    <template v-else>
      <dataset-list-item-title
        :dataset="dataset"
        :show-topics="showTopics"
        :no-link="noLink"
      />
      <dataset-list-item-subtitle
        :dataset="dataset"
        :show-owner="showOwner"
      />
    </template>

    <v-list-item-action class="my-0">
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
    </v-list-item-action>
    <v-list-item-action class="my-0 ml-1">
      <visibility :visibility="dataset.visibility" />
    </v-list-item-action>
    <v-list-item-action
      v-if="showTable"
      class="my-0 ml-1"
    >
      <dataset-btn-table :dataset="dataset" />
    </v-list-item-action>
  </v-list-item>
</template>

<i18n lang="yaml">
fr:
  error: En erreur
en:
  error: Error status
</i18n>

<script>
export default {
  props: {
    dataset: { type: Object, required: true },
    showTopics: { type: Boolean, default: false },
    showOwner: { type: Boolean, default: false },
    showTable: { type: Boolean, default: false },
    noLink: { type: Boolean, default: false },
    dense: { type: Boolean, default: false },
    listItemProps: { type: Object, default: () => ({}) }
  },
  data: () => ({
    hover: false
  })
}
</script>

<style lang="css" scoped>
</style>
