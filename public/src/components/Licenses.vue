<template>
  <div>
    <md-button id="new-license" class="md-raised md-primary" @click="$refs['new-license-dialog'].open()">Ajouter des license</md-button>
    <md-list v-if="settings">
      <md-list-item v-for="(license, rowIndex) in settings.licenses" :key="rowIndex" style="padding:8px 0">
        <md-card style="padding:16px;width:100%">
          <md-layout md-row md-vertical-align="center">
            <md-layout md-row md-vertical-align="center">
              <md-layout md-flex="90" md-column>
                <md-subheader>Nom</md-subheader>
                <span>{{ license.title }}</span>
                <md-subheader>URL</md-subheader>
                <a :href="license.href">{{ license.href }}</a>
              </md-layout>

              <md-layout md-flex="5" md-flex-offset="5" md-column>
                <md-button class="md-icon-button md-raised md-warn md-dense" @click="removeLicense(rowIndex)">
                  <md-icon>remove</md-icon>
                </md-button>
              </md-layout>
            </md-layout>
          </md-layout>
        </md-card>
      </md-list-item>
    </md-list>

    <md-dialog md-open-from="#new-license" md-close-to="#new-license" ref="new-license-dialog">
      <md-dialog-title>Ajout d'une nouvelle license</md-dialog-title>

      <md-dialog-content>
        <md-input-container>
          <label>Titre</label>
          <md-input v-model="newLicense.title"/>
        </md-input-container>

        <md-input-container>
          <label>URL</label>
          <md-input v-model="newLicense.href"/>
        </md-input-container>
      </md-dialog-content>

      <md-dialog-actions>
        <md-button class="md-warn md-raised" @click="$refs['new-license-dialog'].close()">Annuler</md-button>
        <md-button class="md-success md-raised" @click="addLicense">Ajouter</md-button>
      </md-dialog-actions>
    </md-dialog>

  </div>
</template>

<script>

export default {
  name: 'Licenses',
  props: ['settings'],
  data: () => ({
    newLicense: {
      title: null,
      href: null
    }
  }),
  watch: {
    settings() {
      this.settings.licenses = this.settings.licenses || []
    }
  },
  mounted() {
    this.settings.licenses = this.settings.licenses || []
  },
  methods: {
    addLicense() {
      const license = Object.assign({}, this.newLicense)
      this.settings.licenses.push(license)
      this.$refs['new-license-dialog'].close()
      this.$emit('license-updated')
    },
    removeLicense(rowIndex) {
      this.settings.licenses.splice(rowIndex, 1)
      this.$emit('license-updated')
    }
  }
}
</script>
