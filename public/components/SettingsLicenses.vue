<template>
  <div>
    <p>Définissez des licenses pour clarifier les utilisations possibles des jeux de données que vous diffusez.</p>

    <v-btn color="primary" @click="showDialog = true" class="mb-3">Ajouter une license</v-btn>

    <v-list two-line v-if="settings.licenses.length">
      <v-list-tile v-for="(license, rowIndex) in settings.licenses" :key="rowIndex">
        <v-list-tile-content>
          <v-list-tile-title>{{ license.title }}</v-list-tile-title>
          <v-list-tile-sub-title>{{ license.href }}</v-list-tile-sub-title>
        </v-list-tile-content>
        <v-list-tile-action>
          <v-btn color="warning" icon flat title="Supprimer cette license" @click="removeLicense(rowIndex)">
            <v-icon>delete</v-icon>
          </v-btn>
        </v-list-tile-action>
      </v-list-tile>
    </v-list>

    <v-dialog v-model="showDialog" max-width="700px">
      <v-card>
        <v-card-title primary-title>
          Ajout d'une nouvelle license
        </v-card-title>
        <v-card-text>
          <v-form v-model="newLicenseValid">
            <v-text-field label="Titre" v-model="newLicense.title" :rules="[v => !!v || '']" required/>
            <v-text-field label="URL" v-model="newLicense.href" :rules="[v => !!v || '']" required/>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDialog = false">Annuler</v-btn>
          <v-btn color="primary" @click="addLicense" :disabled="!newLicenseValid">Ajouter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
    },
    newLicenseValid: false,
    showDialog: false
  }),
  methods: {
    addLicense() {
      const license = Object.assign({}, this.newLicense)
      this.settings.licenses.push(license)
      this.showDialog = false
      this.$emit('license-updated')
    },
    removeLicense(rowIndex) {
      this.settings.licenses.splice(rowIndex, 1)
      this.$emit('license-updated')
    }
  }
}
</script>
