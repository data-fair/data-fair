<template>
  <span>
    <template v-if="dataset.remoteFile?.autoUpdate?.active">
      mise à jour des données prévue le {{ $moment(dataset.remoteFile?.autoUpdate?.nextUpdate).format('LL') }}
    </template>
    <template v-else>
      mise à jour auto des données non activée
    </template>
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
          color="info"
          v-on="on"
        >
          <v-icon>mdi-pencil</v-icon>
        </v-btn>
      </template>
      <v-card>
        <v-alert
          v-t="dataset.remoteFile?.autoUpdate?.active ? 'alertDeactivate' : 'alertActivate'"
          type="info"
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
            v-if="dataset.remoteFile?.autoUpdate?.active"
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
  </span>
</template>

<i18n lang="yaml">
  fr:
    alertActivate: Si vous activez la mise à jour automatique des données le fichier sera téléchargé 1 fois par semaine.
    alertDeactivate: Souhaitez vous désactiver la mise à jour automatique des données ?
    activate: activer mise à jour auto
    deActivate: désactiver mise à jour auto
    cancel: annuler
  en:
    alertActivate: If you activate the auto-update of data the file will be downloaded once a week.
    alertDeactivate: Do you want to deactivate auto-updating the data ?
    activate: activate auto-update
    deActivate: deactivate auto-update
    cancel: cancel
  </i18n>

<script>
export default {
  props: ['dataset'],
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
