<template>
  <v-stepper v-model="currentStep">
    <v-stepper-header>
      <v-stepper-step
        :complete="!!catalog.type"
        step="1"
        editable
      >
        Sélection du catalogue
      </v-stepper-step>
      <v-divider />
      <v-stepper-step
        :complete="!!catalog.apiKey"
        step="2"
        editable
      >
        Configuration
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <v-sheet min-height="200">
          <v-select
            v-model="catalogUrl"
            :items="configurableCatalogs"
            item-value="href"
            item-text="title"
            label="Choisissez un catalogue à configurer"
            @input="initFromUrl"
          />
          <v-text-field
            v-model="catalogUrl"
            label="Ou saisissez une URL d'un autre catalogue"
            @change="initFromUrl"
          />
          <v-text-field
            v-model="catalog.title"
            :disabled="!catalog.type"
            label="Titre"
          />
        </v-sheet>
        <v-btn
          :disabled="!catalog.type"
          color="primary"
          @click.native="currentStep = 2"
        >
          Continuer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
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
          :disabled="!catalog"
          color="primary"
          @click.native="importCatalog()"
        >
          Enregistrer
        </v-btn>
        <v-btn text @click.native="$emit('cancel')">
          Annuler
        </v-btn>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<script>
  import marked from 'marked/lib/marked'
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    props: ['initCatalog'],
    data: () => ({
      currentStep: null,
      owner: null,
      catalogUrl: null,
      configurableCatalogs: [],
      marked,
      catalog: {},
      importing: false,
      catalogTypes: [],
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
    },
    async mounted() {
      this.configurableCatalogs = await this.$axios.$get('api/v1/configurable-catalogs')
      this.catalogTypes = await this.$axios.$get('api/v1/catalogs/_types')
      if (this.initCatalog) {
        this.catalogUrl = this.initCatalog
        this.initFromUrl()
      }
    },
    methods: {
      async initFromUrl() {
        this.catalog = {}
        if (!this.catalogUrl) return
        try {
          this.catalog = await this.$axios.$post('api/v1/catalogs/_init', null, { params: { url: this.catalogUrl } })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des informations du catalogue' })
        }
      },
      async importCatalog() {
        if (!this.$refs['config-form'].validate()) return
        this.importing = true
        try {
          const catalog = await this.$axios.$post('api/v1/catalogs', this.catalog)
          this.$router.push({ path: `/catalog/${catalog.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'import de la description du catalogue' })
          this.importing = false
        }
      },
    },
  }
</script>
