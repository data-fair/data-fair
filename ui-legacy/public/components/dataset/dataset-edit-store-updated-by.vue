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
        v-t="storeUpdatedBy ? 'alertDeactivate' : 'alertActivate'"
        :type="storeUpdatedBy ? 'warning' : 'info'"
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
          v-if="storeUpdatedBy"
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
  alertActivate: Si vous activez le stockage des utilisateurs qui font des modifications de ligne tous les utilisateurs ayant accès en lecture à ce jeu de données pourront consulter cette information.
  alertDeactivate: Si vous désactivez le stockage des utilisateurs qui font des modifications de ligne cette information sera supprimée et ne sera récupérable.
  activate: activer
  deActivate: désactiver
  cancel: annuler
en:
  alertActivate: If you activate the storage of the users that make line changes all users with read access to this dataset will be able to read this information.
  alertDeactivate: If you deactivate the storage of the users that make line changes this information will be deleted and will not be recoverable.
  activate: activate
  deActivate: deactivate
  cancel: cancel
</i18n>

<script>
export default {
  props: ['storeUpdatedBy'],
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
