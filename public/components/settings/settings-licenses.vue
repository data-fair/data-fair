<template>
  <div>
    <v-btn
      color="primary"
      class="mb-3"
      @click="showDialog = true"
    >
      {{ $t('addLicense') }}
    </v-btn>

    <v-list
      v-if="settings.licenses.length"
      two-line
      outlined
    >
      <v-list-item
        v-for="(license, rowIndex) in settings.licenses"
        :key="rowIndex"
      >
        <v-list-item-content>
          <v-list-item-title>{{ license.title }}</v-list-item-title>
          <v-list-item-subtitle>{{ license.href }}</v-list-item-subtitle>
        </v-list-item-content>
        <v-list-item-action>
          <v-btn
            color="warning"
            icon
            :title="$t('deleteLicense')"
            @click="removeLicense(rowIndex)"
          >
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </v-list-item-action>
      </v-list-item>
    </v-list>

    <v-dialog
      v-model="showDialog"
      max-width="700px"
    >
      <v-card outlined>
        <v-card-title primary-title>
          {{ $t('addNewLicense') }}
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
            text
            @click="showDialog = false"
          >
            {{ $t('cancel') }}
          </v-btn>
          <v-btn
            :disabled="!newLicenseValid"
            color="primary"
            @click="addLicense"
          >
            {{ $t('add') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<i18n lang="yaml">
fr:
  addLicense: Ajouter une licence
  deleteLicense: Supprimer cette licence
  addNewLicense: Ajout d'une nouvelle license
  cancel: Annuler
  add: Ajouter
en:
  addLicense: Add a license
  deleteLicense: Delete this license
  addNewLicense: Add a new license
  cancel: Cancel
  add: Add
</i18n>

<script>

export default {
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
    addLicense () {
      const license = Object.assign({}, this.newLicense)
      this.settings.licenses.push(license)
      this.showDialog = false
      this.$emit('license-updated')
    },
    removeLicense (rowIndex) {
      this.settings.licenses.splice(rowIndex, 1)
      this.$emit('license-updated')
    }
  }
}
</script>
