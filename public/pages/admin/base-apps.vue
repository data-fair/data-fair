<template lang="html">
  <v-row class="my-0">
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row>
          <v-col>
            <h2 class="text-h6">
              {{ $t('applications') }}
            </h2>
            <v-row>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-text-field
                  v-model="q"
                  name="q"
                  :label="$t('search')"
                  hide-details
                  outlined
                  dense
                  append-icon="mdi-magnify"
                  @keypress.enter="refresh"
                />
              </v-col>
            </v-row>

            <v-row>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-text-field
                  v-model="urlToAdd"
                  label="Ajouter"
                  :placeholder="$t('inputUrl')"
                  @keypress.enter="add"
                />
              </v-col>
            </v-row>

            <v-sheet v-if="baseApps">
              <v-list three-line>
                <v-list-item
                  v-for="baseApp in baseApps"
                  :key="baseApp.id"
                >
                  <v-list-item-avatar tile>
                    <img :src="baseApp.thumbnail">
                  </v-list-item-avatar>
                  <v-list-item-content>
                    <v-list-item-title>
                      {{ baseApp.title[$i18n.locale] || baseApp.title[$i18n.defaultLocale] || baseApp.title.fr }}
                      <v-chip small dark>
                        {{ baseApp.category || 'autre' }}
                      </v-chip>
                      <a :href="baseApp.url">{{ baseApp.applicationName }} ({{ baseApp.version }})</a>
                      <v-icon
                        v-if="baseApp.public"
                        color="green"
                      >
                        mdi-lock-open
                      </v-icon>
                      <template v-else>
                        <v-icon color="red">
                          mdi-lock
                        </v-icon>
                        <span>{{ (baseApp.privateAccess || []).map(p => p.name).join(', ') }}</span>
                      </template>
                      <v-icon v-if="baseApp.deprecated">
                        mdi-eye-off
                      </v-icon>
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ baseApp.description[$i18n.locale] || baseApp.description[$i18n.defaultLocale] || baseApp.description.fr }}
                    </v-list-item-subtitle>
                    <v-list-item-subtitle>
                      <nuxt-link v-if="baseApp.nbApplications" :to="{path: '/applications', query: {url: baseApp.url, showAll: true}}">
                        {{ $tc('nbApplications', baseApp.nbApplications) }} -
                      </nuxt-link>
                      {{ $t('datasets') }} : {{ baseApp.datasetsFilters }}
                    </v-list-item-subtitle>
                  </v-list-item-content>
                  <v-list-item-action>
                    <v-icon
                      color="primary"
                      @click="currentBaseApp = baseApp; patch = newPatch(baseApp); showEditDialog = true;"
                    >
                      mdi-pencil
                    </v-icon>
                  </v-list-item-action>
                </v-list-item>
              </v-list>
            </v-sheet>
          </v-col>
        </v-row>

        <v-dialog
          v-model="showEditDialog"
          max-width="500px"
          transition="dialog-transition"
        >
          <v-card v-if="currentBaseApp" outlined>
            <v-card-title primary-title>
              <h3 class="text-h6 mb-0">
                {{ $t('edition', {title: currentBaseApp.title}) }}
              </h3>
            </v-card-title>
            <v-card-text>
              <p>URL : {{ currentBaseApp.url }}</p>
              <v-checkbox
                v-model="patch.deprecated"
                label="Dépréciée"
              />
              <v-form>
                <v-text-field
                  v-model="patch.applicationName"
                  name="applicationName"
                  :label="$t('id')"
                />
                <v-text-field
                  v-model="patch.version"
                  name="version"
                  :label="$t('version')"
                />
                <template v-for="locale in $i18n.locales">
                  <v-text-field
                    :key="'title-' + locale"
                    v-model="patch.title[locale]"
                    name="title"
                    :label="$t('title') + ' ' + locale"
                  />
                </template>
                <template v-for="locale in $i18n.locales">
                  <v-textarea
                    :key="'desc-' + locale"
                    v-model="patch.description[locale]"
                    name="description"
                    :label="$t('description') + ' ' + locale"
                  />
                </template>
                <v-text-field
                  v-model="patch.image"
                  name="image"
                  :label="$t('image')"
                />
                <v-select
                  v-model="patch.category"
                  name="category"
                  :label="$t('category')"
                  clearable
                  :items="env.baseAppsCategories"
                />
                <v-text-field
                  v-model="patch.documentation"
                  name="documentation"
                  :label="$t('documentation')"
                />
                <private-access :patch="patch" />
              </v-form>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn text @click="showEditDialog = false">
                {{ $t('cancel') }}
              </v-btn>
              <v-btn
                color="primary"
                @click="applyPatch(currentBaseApp, patch); showEditDialog = false"
              >
                {{ $t('save') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-container>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  applications: Applications
  inputUrl: Saisissez l'URL d'une nouvelle application
  datasets: Jeux de données
  id: Identifiant d'application
  version: Version d'application
  title: Titre
  description: Description
  save: Enregistrer
  cancel: Annuler
  image: Image
  category: Catégorie
  documentation: Documentation
  edition: "Édition de {title}"
  nbApplications: "aucune visualisation | 1 visualisation | {count} visualisations"
en:
  search: Search
  applications: Applications
  inputUrl: Type the URL of a new application
  datasets: Datasets
  id: Application id
  version: Application version
  title: Title
  description: Description
  save: Save
  cancel: Cancel
  image: Image
  category: Category
  documentation: Documentation
  edition: "Editing {title}"
  nbApplications: "no visualization | 1 visualization | {count} visualizations"
</i18n>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data() {
      return {
        baseApps: null,
        patch: {},
        showEditDialog: false,
        currentBaseApp: null,
        q: null,
        urlToAdd: null,
      }
    },
    computed: {
      ...mapState(['env']),
    },
    async mounted() {
      this.refresh()
    },
    methods: {
      async refresh() {
        this.baseApps = (await this.$axios.$get('api/v1/admin/base-applications', { params: { size: 10000, thumbnail: '40x40', count: true, q: this.q } }))
          .results.sort((ba1, ba2) => {
            // the 'fr' was the historical default of data-fair applications
            const title1 = ba1.title[this.$i18n.locale] || ba1.title[this.$i18n.defaultLocale] || ba1.title.fr || ''
            const title2 = ba2.title[this.$i18n.locale] || ba2.title[this.$i18n.defaultLocale] || ba2.title.fr || ''
            return title1.localeCompare(title2)
          })
      },
      newPatch(baseApp) {
        return {
          title: baseApp.title,
          applicationName: baseApp.applicationName,
          version: baseApp.version,
          description: baseApp.description,
          category: baseApp.category,
          public: baseApp.public,
          deprecated: baseApp.deprecated,
          image: baseApp.image,
          privateAccess: baseApp.privateAccess || [],
        }
      },
      async applyPatch(baseApp, patch) {
        const actualPatch = { ...patch }
        if (actualPatch.public) actualPatch.privateAccess = []
        actualPatch.category = actualPatch.category || null
        await this.$axios.$patch(`api/v1/base-applications/${baseApp.id}`, actualPatch)
        Object.keys(actualPatch).forEach(key => {
          this.$set(baseApp, key, actualPatch[key])
        })
      },
      async add() {
        try {
          await this.$axios.$post('api/v1/base-applications', { url: this.urlToAdd })
          eventBus.$emit('notification', { type: 'success', msg: 'Application ajoutée' })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Impossible d\'ajouter\' l\'application' })
        }
        this.refresh()
      },
    },
  }
</script>

<style lang="css">
</style>
