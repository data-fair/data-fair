<template>
  <v-menu
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
        v-t="history ? 'alertDeactivate' : 'alertActivate'"
        :type="history ? 'warning' : 'info'"
        :value="true"
        tile
        dense
        text
        :icon="false"
        class="mb-0 mt-1"
      />
      <v-card-actions>
        <v-spacer />
        <v-btn
          v-t="'cancel'"
          text
          @click="show = false"
        />
        <v-btn
          v-if="history"
          v-t="'deActivate'"
          color="warning"
          @click="change(false)"
        />
        <v-btn
          v-else
          v-t="'activate'"
          color="primary"
          @click="change(true)"
        />
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  alertActivate: Si vous activez l'historisation le volume de données consommé sera augmenté de manière importante. En fonction du nombre de lignes du jeu de données cette opération peut prendre du temps.
  alertDeactivate: Si vous désactivez l'historisation toutes les révisions de lignes déjà stockées seront supprimées et ne seront pas récupérables.
  activate: activer l'historisation
  deActivate: désactiver l'historisation
  cancel: annuler
en:
  alertActivate: If you activate the history the used data storage will be significantly increased. Depending on the number of lines this operation can take some time.
  alertDeactivate: If you deactivate the history all lines revisions already stored will be deleted and will not be recoverable.
  alertRevisions: If you configure automatic expiration of revisions, the deleted data will not be recoverable.
  activate: activate history
  deActivate: deactivate history
  cancel: cancel
</i18n>

<script>
export default {
  props: ['history'],
  data: () => ({
    show: false
  }),
  methods: {
    change (value) {
      this.$emit('change', value)
      this.show = false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
