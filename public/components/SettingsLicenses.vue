<template>
  <div>
    <p>Définissez des licenses pour clarifier les utilisations possibles des jeux de données que vous diffusez.</p>

    <v-btn
      color="primary"
      class="mb-3"
      @click="showDialog = true"
    >
      Ajouter une license
    </v-btn>

    <v-list
      v-if="settings.licenses.length"
      two-line
    >
      <v-list-item
        v-for="(license, rowIndex) in settings.licenses"
        :key="rowIndex"
      >
        <v-list-item-content>
          <v-list-item-title>{{ license.title }}</v-list-item-title>
          <v-list-item-sub-title>{{ license.href }}</v-list-item-sub-title>
        </v-list-item-content>
        <v-list-item-action>
          <v-btn
            color="warning"
            icon
            flat
            title="Supprimer cette license"
            @click="removeLicense(rowIndex)"
          >
            <v-icon>delete</v-icon>
          </v-btn>
        </v-list-item-action>
      </v-list-item>
    </v-list>

    <v-dialog
      v-model="showDialog"
      max-width="700px"
    >
      <v-card>
        <v-card-title primary-title>
          Ajout d'une nouvelle license
        </v-card-title>
        <v-card-text>
          <v-form v-model="newLicenseValid">
            <v-text-field
              v-model="newLicense.title"
              :rules="[v => !!v || '']"
              label="Titre"
              required
            />
            <v-text-field
              v-model="newLicense.href"
              :rules="[v => !!v || '']"
              label="URL"
              required
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            flat
            @click="showDialog = false"
          >
            Annuler
          </v-btn>
          <v-btn
            :disabled="!newLicenseValid"
            color="primary"
            @click="addLicense"
          >
            Ajouter
          </v-btn>
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
        href: null,
      },
      newLicenseValid: false,
      showDialog: false,
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
      },
    },
  }
</script>
