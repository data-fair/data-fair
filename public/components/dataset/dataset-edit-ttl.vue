<template>
  <v-menu
    v-if="editTtl"
    v-model="show"
    :close-on-content-click="false"
    max-width="400"
    left
    offset-y
  >
    <template #activator="{on}">
      <v-btn
        icon
        color="warning"
        v-on="on"
      >
        <v-icon>mdi-pencil</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-alert
        v-t="revisions ? 'alertRevisions' : 'alert'"
        type="warning"
        :value="true"
        tile
        dense
        text
        :icon="false"
        class="mb-0 mt-1"
      />
      <v-card-text>
        <v-checkbox
          v-model="editTtl.active"
          :label="$t('activate')"
        />
        <v-select
          v-if="!revisions"
          v-model="editTtl.prop"
          :label="$t('col')"
          :items="schema.filter(prop => prop.format === 'date-time')"
          item-value="key"
          :item-text="(field) => field.title || field['x-originalName'] || field.key"
        />
        <v-text-field
          v-model.number="editTtl.delay.value"
          outlined
          dense
          type="number"
          :label="$t('days')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          v-t="'cancel'"
          text
          @click="show = false"
        />
        <v-btn
          v-t="'save'"
          color="warning"
          @click="change"
        />
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  alert: Si vous configurez l'expiration automatique, les lignes supprimées ne pourront pas être récupérées.
  alertRevisions: Si vous configurez l'expiration automatique des révisions, les informations supprimées ne pourront pas être récupérées.
  activate: activer l'expiration automatique
  col: colonne de date de référence
  days: nombre de jours avant expiration
  cancel: annuler
  save: enregistrer
en:
  alert: If you configure automatic expiration, the deleted lines will not be recoverable.
  alertRevisions: If you configure automatic expiration of revisions, the deleted data will not be recoverable.
  activate: activate automatic expiration
  col: column containing the reference date
  days: number of days before expiration
  cancel: cancel
  save: Save
</i18n>

<script>
export default {
  props: ['ttl', 'schema', 'revisions'],
  data: () => ({
    show: false,
    editTtl: null
  }),
  watch: {
    ttl: {
      immediate: true,
      handler () {
        this.editTtl = JSON.parse(JSON.stringify(this.ttl))
      }
    }
  },
  methods: {
    change () {
      this.editTtl.delay.value = this.editTtl.delay.value || 0
      this.$emit('change', this.editTtl)
      this.show = false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
