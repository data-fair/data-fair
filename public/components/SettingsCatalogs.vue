<template>
  <div>
    <p>Définissez des connexions à des catalogues pour publier des jeux de données et des réutilisations.</p>

    <v-btn color="primary" @click="showDialog = true" class="mb-3">Ajouter un catalogue</v-btn>

    <v-list two-line v-if="settings.catalogs.length">
      <v-list-tile v-for="(catalog, rowIndex) in settings.catalogs" :key="rowIndex">
        <v-list-tile-content>
          <v-list-tile-title>{{ catalog.title }}</v-list-tile-title>
          <v-list-tile-sub-title>{{ catalog.href }}</v-list-tile-sub-title>
        </v-list-tile-content>
        <v-list-tile-action>
          <v-btn color="warning" icon flat title="Supprimer ce catalogue" @click="removeCatalog(rowIndex)">
            <v-icon>delete</v-icon>
          </v-btn>
        </v-list-tile-action>
      </v-list-tile>
    </v-list>

    <v-dialog v-model="showDialog" max-width="700px">
      <v-card>
        <v-card-title primary-title>
          Ajout d'un nouveau catalogue
        </v-card-title>
        <v-card-text>
          <v-form v-model="newCatalogValid">
            <v-text-field label="Titre" v-model="newCatalog.title" required :rules="[() => !!newCatalog.title]"/>
            <v-text-field label="URL" v-model="newCatalog.href" required :rules="[() => !!newCatalog.href]"/>
            <v-text-field label="Clé d'API" :hint="apiKeyHint" persistent-hint v-model="newCatalog.apiKey" required :rules="[() => !!newCatalog.apiKey]"/>
            <v-text-field label="Identifiant d'organisation" :hint="orgHint" persistent-hint v-model="newCatalog.organizationId" />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer/>
          <v-btn flat @click="showDialog = false">Annuler</v-btn>
          <v-btn color="primary" :disabled="!newCatalogValid" @click="addCatalog">Ajouter</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>

const emptyOrg = {id: null, name: 'Compte personnel'}

export default {
  name: 'Catalogs',
  props: ['settings'],
  data: () => ({
    newCatalog: {
      title: 'data.gouv.fr',
      href: 'https://www.data.gouv.fr',
      apiKey: null,
      type: 'udata',
      organizationId: ''
    },
    showDialog: true,
    apiKeyHint: 'Cette clé est à configurer dans votre profil sur le catalogue, par exemple sur <a target="_blank" href="https://www.data.gouv.fr/fr/admin/me/#apikey">data.gouv.fr</a>.',
    newCatalogValid: true,
    orgHint: `Laissez vide pour travailler sur un compte personnel. Sinon utilisez l'identifiant d'une organisation dans laquelle vous avez le droit d'écriture.`
  }),
  methods: {
    addCatalog() {
      const catalog = Object.assign({}, this.newCatalog)
      this.settings.catalogs.push(catalog)
      this.showDialog = false
      this.$emit('catalog-updated')
    },
    removeCatalog(rowIndex) {
      this.settings.catalogs.splice(rowIndex, 1)
      this.$emit('catalog-updated')
    }
  }
}
</script>
