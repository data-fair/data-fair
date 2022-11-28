<template>
  <v-stepper
    v-model="currentStep"
    class="elevation-0"
  >
    <v-stepper-header>
      <v-stepper-step
        :step="1"
        :complete="!!publicationSite"
        :editable="!!dataset"
      >
        {{ $t('stepPortal') }}
        <small v-if="publicationSite">
          {{ publicationSite.title || publicationSite.url || publicationSite.id | truncate(30) }}
        </small>
      </v-stepper-step>
      <v-divider />

      <v-stepper-step
        :step="2"
        :complete="!!dataset"
        editable
      >
        {{ $t('stepDataset') }}
        <small v-if="dataset">
          {{ dataset.title | truncate(30) }}
        </small>
      </v-stepper-step>
      <v-divider />

      <v-stepper-step
        :step="3"
        :editable="metadataForm"
      >
        {{ $t('stepPermissions') }}
        <small
          v-if="$refs.permissions && $refs.permissions.visibilityLabel"
        >
          {{ $refs.permissions.visibilityLabel }}
        </small>
      </v-stepper-step>
      <v-divider />

      <v-stepper-step
        :step="4"
        :complete="!!metadataForm"
        :editable="!!publicationSite"
      >
        {{ $t('stepMetadata') }}
        <small
          v-if="metadataForm"
          v-t="'completed'"
        />
      </v-stepper-step>
      <v-divider />

      <v-stepper-step
        :step="5"
        :editable="metadataForm"
      >
        {{ $t('stepAction') }}
      </v-stepper-step>
    </v-stepper-header>

    <v-stepper-items>
      <v-stepper-content step="1">
        <p>{{ $t('selectPortal') }}</p>
        <v-card
          v-if="publicationSites"
          tile
          outlined
          style="width: 500px;"
        >
          <v-list class="py-0">
            <v-list-item-group
              :value="publicationSite && publicationSites.findIndex(p => p.type === publicationSite.type && p.id === publicationSite.id)"
              color="primary"
            >
              <v-list-item
                v-for="(site,i) in publicationSites"
                :key="i"
                @click="publicationSite = site;currentStep=2"
              >
                <v-list-item-content style="overflow:visible;">
                  <v-list-item-title>
                    <v-icon
                      v-if="site.private"
                      small
                      color="warning"
                    >
                      mdi-lock
                    </v-icon>
                    {{ site.title || site.url || site.id }}
                  </v-list-item-title>
                  <v-list-item-subtitle
                    v-if="site.department"
                    class="mb-2"
                  >
                    <span>{{ dataset.owner.name }}</span>
                    <span v-if="site.department"> - {{ site.departmentName || site.department }}</span>
                  </v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </v-list-item-group>
          </v-list>
        </v-card>

        <v-btn
          v-t="'continue'"
          color="primary"
          class="mt-4"
          :disabled="!publicationSite"
          @click.native="currentStep = 2"
        />
      </v-stepper-content>

      <v-stepper-content step="2">
        <v-row class="my-1 mx-0">
          <dataset-select @change="toggleDataset" />
        </v-row>

        <v-btn
          v-t="'continue'"
          color="primary"
          class="ml-2 mt-4"
          :disabled="!dataset"
          @click.native="currentStep = 3"
        />
      </v-stepper-content>

      <v-stepper-content step="3">
        <permissions
          v-if="dataset && can('getPermissions')"
          ref="permissions"
          :disabled="!can('setPermissions')"
          :resource="dataset"
          :resource-url="resourceUrl"
          :api="api"
          :has-public-deps="hasPublicApplications"
          :simple="true"
        />

        <v-btn
          v-t="'continue'"
          color="primary"
          class="mt-4"
          :disabled="!metadataForm"
          @click.native="currentStep = 4"
        />
      </v-stepper-content>

      <v-stepper-content step="4">
        <v-form
          v-if="dataset && publicationSite"
          ref="metadataForm"
          v-model="metadataForm"
        >
          <dataset-info
            :required="(publicationSite.settings && publicationSite.settings.datasetsRequiredMetadata) || []"
            :simple="true"
          />
        </v-form>

        <v-btn
          v-t="'continue'"
          color="primary"
          class="mt-4"
          :disabled="!metadataForm"
          @click.native="currentStep = 5"
        />
      </v-stepper-content>

      <v-stepper-content step="5">
        <template v-if="dataset && publicationSite">
          <v-btn
            v-if="can('writePublicationSites') && (!activeAccount.department || activeAccount.department === site.department)"
            v-t="'publish'"
            color="primary"
            class="mt-4"
            @click.native="publish"
          />
          <v-btn
            v-else
            v-t="'requestPublication'"
            color="primary"
            class="mt-4"
            @click.native="requestPublication"
          />
        </template>
      </v-stepper-content>
    </v-stepper-items>
  </v-stepper>
</template>

<i18n lang="yaml">
fr:
  shareDataset: Publier un jeu de données
  home: Accueil
  dataset: Jeu de données
  selectPortal: Choisissez un portail
  stepDataset: Jeu de données
  stepPortal: Portail
  stepPermissions: Permissions
  stepMetadata: Métadonnées
  stepAction: Confirmation
  continue: Continuer
  cancel: Annuler
  publish: Publier le jeu de données
  requestPublication: Demander la publication de ce jeu de données à un administrateur
  publicationRequested: La publication sera soumise à un administrateur pour validation.
  completed: complètes
en:
  shareDataset: Share a dataset
  home: Home
  dataset: Dataset
  selectPortal: Select a portal
  stepDataset: Dataset
  stepPortal: Portal
  stepPermissions: Permissions
  stepMetadata: Metadata
  stepAction: Confirmation
  continue: Continue
  cancel: Cancel
  publish: Publish the dataset
  requestPublication: Submit the publication of this dataset to an admin for approval
  publicationRequested: The publication will be submitted to an admin for validation.
  completed: completed
</i18n>

<script>
import eventBus from '~/event-bus'
import { mapState, mapGetters, mapActions } from 'vuex'

export default {
  data: () => ({
    currentStep: 1,
    publicationSite: null,
    metadataForm: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapGetters(['ownerPublicationSites']),
    ...mapState('dataset', ['dataset', 'api']),
    ...mapGetters('dataset', ['can', 'resourceUrl', 'hasPublicApplications']),
    publicationSites () {
      return this.ownerPublicationSites(this.activeAccount)
    }
  },
  watch: {
    async currentStep () {
      if (this.currentStep === 4) {
        await this.$nextTick()
        this.$refs.metadataForm.validate()
      }
    }
  },
  created () {
    this.$store.dispatch('dataset/clear')
    this.$store.dispatch('breadcrumbs', [{ text: this.$t('home'), to: '/' }, { text: this.$t('shareDataset') }])
    this.$store.dispatch('fetchPublicationSites', this.activeAccount)
  },
  methods: {
    ...mapActions('dataset', ['patch']),
    async toggleDataset (dataset) {
      if (dataset) {
        await this.$store.dispatch('dataset/setId', { datasetId: dataset.id })
        this.currentStep = 3
      } else {
        this.$store.dispatch('dataset/clear')
      }
    },
    async publish () {
      const siteKey = `${this.publicationSite.type}:${this.publicationSite.id}`
      this.dataset.publicationSites = this.dataset.publicationSites || []
      this.dataset.publicationSites.push(siteKey)
      await this.patch({ publicationSites: this.dataset.publicationSites })
      if (this.publicationSite.datasetUrlTemplate) {
        window.location.href = this.site.datasetUrlTemplate.replace('{id}', this.dataset.id)
      } else {
        this.$router.push({ path: `/dataset/${this.dataset.id}` })
      }
    },
    async requestPublication () {
      const siteKey = `${this.publicationSite.type}:${this.publicationSite.id}`
      this.dataset.requestedPublicationSites = this.dataset.requestedPublicationSites || []
      this.dataset.requestedPublicationSites.push(siteKey)
      await this.patch({ requestedPublicationSites: this.dataset.requestedPublicationSites })
      eventBus.$emit('notification', this.$t('publicationRequested'))
    }
  }
}
</script>
