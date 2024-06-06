<template>
  <v-row
    v-if="remoteFile"
    class="dataset-virtual"
  >
    <v-col>
      <v-form v-model="remoteFileForm">
        <v-text-field
          v-model="remoteFile.url"
          :label="$t('inputRemoteFile')"
          hide-details
          outlined
          dense
          style="max-width: 600px;"
          :rules="[val => val && val.startsWith('http://') || val.startsWith('https://')]"
        />

        <v-checkbox
          v-model="remoteFile.autoUpdate.active"
          :label="$t('autoUpdate')"
        />
        <v-alert
          v-if="remoteFile.autoUpdate.nextUpdate"
          :value="true"
          type="info"
          outlined
          style="display:inline-block;"
        >
          {{ $t('nextUpdate') }} {{ remoteFile.autoUpdate.nextUpdate | moment("from", "now") }}
        </v-alert>
      </v-form>
      <v-row class="ma-0 mt-2">
        <v-btn
          color="warning"
          @click="forceUpdate"
        >
          {{ $t('forceUpdate') }}
          <v-icon right>mdi-refresh</v-icon>
        </v-btn>
      </v-row>
      <v-row class="ma-0 mt-2">
        <v-spacer />
        <v-btn
          color="primary"
          :disabled="!hasChanges || !remoteFileForm"
          @click="save"
        >
          {{ $t('save') }}
        </v-btn>
      </v-row>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
  fr:
    save: Enregister
    inputRemoteFile: URL du fichier distant
    autoUpdate: Activer la mise à jour automatique
    nextUpdate: Prochaine mise à jour
    forceUpdate: Forcer la mise à jour
  en:
    save: Save
    inputRemoteFile: URL of the remote file
    autoUpdate: Activate auto-update
    nextUpdate: Next update
    forceUpdate: Force update
</i18n>

<script>
import { mapState, mapActions } from 'vuex'

export default {
  data () {
    return {
      originalRemoteFile: null,
      remoteFile: null,
      remoteFileForm: false
    }
  },
  computed: {
    ...mapState('dataset', ['dataset']),
    hasChanges () {
      return this.originalRemoteFile !== JSON.stringify(this.remoteFile)
    }
  },
  watch: {
    'dataset.remoteFile' () {
      this.init()
    }
  },
  mounted () {
    this.init()
  },
  methods: {
    ...mapActions('dataset', ['patchAndApplyRemoteChange']),
    init () {
      this.originalRemoteFile = JSON.stringify({ autoUpdate: { active: false }, ...this.dataset.remoteFile })
      this.remoteFile = JSON.parse(this.originalRemoteFile)
    },
    async save () {
      await this.patchAndApplyRemoteChange({ remoteFile: this.remoteFile })
    },
    async forceUpdate () {
      await this.patchAndApplyRemoteChange({ remoteFile: { ...this.originalRemoteFile, forceUpdate: true } })
    }
  }
}
</script>
