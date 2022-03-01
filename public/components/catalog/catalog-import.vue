<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        v-t="'catalogSelection'"
        :complete="!!catalog.type"
        step="1"
        editable
      />
      <v-divider />
      <v-stepper-step
        v-t="'configuration'"
        :complete="!!catalog.apiKey"
        step="2"
        editable
      />
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-sheet min-height="200">
          <v-select
            v-model="catalogUrl"
            :items="configurableCatalogs"
            item-value="href"
            item-text="title"
            :label="$t('choseCatalog')"
            @input="initFromUrl"
          />
          <v-text-field
            v-model="catalogUrl"
            :label="$t('orUrl')"
            @change="initFromUrl"
          />
          <v-text-field
            v-model="catalog.title"
            :disabled="!catalog.type"
            :label="$t('title')"
          />
        </v-sheet>
        <v-btn
          v-t="'continue'"
          :disabled="!catalog.type"
          color="primary"
          @click.native="currentStep = 2"
        />
        <v-btn
          v-t="'cancel'"
          text
          @click.native="$emit('cancel')"
        />
      </v-stepper-content>

      <v-stepper-content step="2">
        <v-sheet min-height="200">
          <v-form ref="config-form">
            <catalog-config-form
              :catalog="catalog"
              :catalog-type="catalogTypes.find(t => t.key === catalog.type)"
            />
          </v-form>
        </v-sheet>
        <v-btn
          v-t="'save'"
          :disabled="!catalog"
          color="primary"
          @click.native="importCatalog()"
        />
        <v-btn
          v-t="'cancel'"
          text
          @click.native="$emit('cancel')"
        />
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  catalogSelection: Sélection du catalogue
  configuration: Configuration
  choseCatalog: Choisissez un catalogue à configurer
  orUrl: Ou saisissez une URL d'un autre catalogue
  title: Titre
  cancel: Annuler
  continue: Continuer
  save: Enregistrer
  fetchError: Erreur pendant la récupération des informations du catalogue
  importError: Erreur pendant l'import de la description du catalogue
en:
  catalogSelection: Catalog selection
  configuration: Configuration
  choseCatalog: Chose a catalog
  orUrl: Or enter the URL of an other catalog
  title: Title
  cancel: Cancel
  continue: Continue
  save: Save
  fetchError: Error while fetching catalog information
  importError: Error while importing catalog description
</i18n>

<script>
import { mapState } from 'vuex'
import eventBus from '~/event-bus'

export default {
  props: ['initCatalog'],
  data: () => ({
    currentStep: null,
    owner: null,
    catalogUrl: null,
    configurableCatalogs: [],
    catalog: {},
    importing: false,
    catalogTypes: []
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env'])
  },
  async mounted () {
    this.configurableCatalogs = await this.$axios.$get('api/v1/configurable-catalogs')
    this.catalogTypes = await this.$axios.$get('api/v1/catalogs/_types')
    if (this.initCatalog) {
      this.catalogUrl = this.initCatalog
      this.initFromUrl()
    }
  },
  methods: {
    async initFromUrl () {
      this.catalog = {}
      if (!this.catalogUrl) return
      try {
        this.catalog = await this.$axios.$post('api/v1/catalogs/_init', null, { params: { url: this.catalogUrl } })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('fetchError') })
      }
    },
    async importCatalog () {
      if (!this.$refs['config-form'].validate()) return
      this.importing = true
      try {
        const catalog = await this.$axios.$post('api/v1/catalogs', this.catalog)
        this.$router.push({ path: `/catalog/${catalog.id}` })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('importError') })
        this.importing = false
      }
    }
  }
}
</script>
