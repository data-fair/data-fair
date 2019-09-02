<template lang="html">
  <v-container fluid grid-list-lg pa-0>
    <v-layout row wrap>
      <v-flex xs12 md6 order-md2>
        <v-card class="mb-3">
          <v-list>
            <v-list-tile>
              <v-list-tile-avatar>
                <v-icon v-if="dataset.owner.type === 'user'">
                  person
                </v-icon>
                <v-icon v-else>
                  group
                </v-icon>
              </v-list-tile-avatar>
              <span>{{ dataset.owner.name }}</span>
              <span v-if="dataset.owner.role">&nbsp;(rôle {{ dataset.owner.role }})</span>
            </v-list-tile>
            <v-list-tile v-if="journal[0]" :class="'event-' + journal[0].type">
              <v-list-tile-avatar v-if="['finalize-end', 'error', 'publication'].includes(journal[0].type)">
                <v-icon>{{ events[journal[0].type].icon }}</v-icon>
              </v-list-tile-avatar>
              <v-list-tile-avatar v-else>
                <v-progress-circular :size="20" :width="3" small indeterminate color="primary" />
              </v-list-tile-avatar>
              <div v-if="journal[0].type === 'error'">
                <p>{{ events[journal[0].type] && events[journal[0].type].text }}</p>
                <p v-html="journal[0].data" />
              </div>
              <span v-else>{{ events[journal[0].type] && events[journal[0].type].text }}</span>
              <v-spacer />
              <v-list-tile-action v-if="journal[0].type === 'error' && can('writeDescription')">
                <v-btn v-if="user.adminMode" icon title="Reindexer en tant que super admin" @click="reindex({})">
                  <v-icon>play_arrow</v-icon>
                </v-btn>
                <v-btn v-else icon title="Relancer" @click="patch({})">
                  <v-icon>play_arrow</v-icon>
                </v-btn>
              </v-list-tile-action>
            </v-list-tile>
            <v-list-tile v-if="dataset.file">
              <v-list-tile-avatar><v-icon>insert_drive_file</v-icon></v-list-tile-avatar>
              <span>{{ (dataset.remoteFile || dataset.originalFile || dataset.file).name }} {{ ((dataset.remoteFile || dataset.originalFile || dataset.file).size / 1000).toFixed(2) }} ko</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>update</v-icon></v-list-tile-avatar>
              <span>{{ dataset.updatedBy.name }} {{ dataset.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>add_circle_outline</v-icon></v-list-tile-avatar>
              <span>{{ dataset.createdBy.name }} {{ dataset.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
            <v-list-tile v-if="dataset.count !== undefined">
              <v-list-tile-avatar><v-icon>view_headline</v-icon></v-list-tile-avatar>
              <span>{{ dataset.count }} enregistrements</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar v-if="nbApplications === null">
                <v-progress-circular :size="20" :width="3" small indeterminate color="primary" />
              </v-list-tile-avatar>
              <template v-else>
                <v-list-tile-avatar><v-icon>touch_app</v-icon></v-list-tile-avatar>
                <span v-if="nbApplications === 0">0 application</span>
                <nuxt-link v-else :to="`/applications?dataset=${dataset.id}`">
                  {{ nbApplications }} application{{ nbApplications > 1 ? 's' : '' }}
                </nuxt-link>
              </template>
            </v-list-tile>
            <v-list-tile v-if="nbVirtualDatasets">
              <v-list-tile-avatar><v-icon>picture_in_picture</v-icon></v-list-tile-avatar>
              <nuxt-link :to="`/datasets?children=${dataset.id}`">
                {{ nbVirtualDatasets }} jeu{{ nbVirtualDatasets > 1 ? 'x' : '' }} de données virtuel{{ nbVirtualDatasets > 1 ? 's' : '' }}
              </nuxt-link>
            </v-list-tile>
            <v-list-tile v-if="dataset.isRest">
              <v-list-tile-avatar><v-icon>all_inclusive</v-icon></v-list-tile-avatar>
              <span>Jeu de données incrémental</span>
            </v-list-tile>
          </v-list>
        </v-card>
      </v-flex>
      <v-flex xs12 md6 order-md1>
        <v-text-field v-model="dataset.title" :disabled="!can('writeDescription')" label="Titre" @change="patch({title: dataset.title})" />
        <v-textarea v-model="dataset.description" :disabled="!can('writeDescription')" label="Description" box rows="4" @change="patch({description: dataset.description})" />
        <v-select
          v-model="dataset.license"
          :items="licenses"
          :disabled="!can('writeDescription')"
          item-text="title"
          item-key="href"
          label="Licence"
          return-object
          @input="patch({license: dataset.license})"
        />
        <v-select
          v-if="editProjection && projections"
          v-model="dataset.projection"
          :items="projections"
          :disabled="!can('writeDescription')"
          item-text="title"
          item-key="code"
          label="Projection cartographique"
          return-object
          @input="patch({projection: dataset.projection})"
        />
        <v-text-field v-model="dataset.origin" :disabled="!can('writeDescription')" label="Provenance" @change="patch({origin: dataset.origin})" />
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
const { mapState, mapActions, mapGetters } = require('vuex')
const events = require('../../shared/events.json').dataset
const coordXUri = 'http://data.ign.fr/def/geometrie#coordX'
const coordYUri = 'http://data.ign.fr/def/geometrie#coordY'

export default {
  data() {
    return { events, error: null }
  },
  computed: {
    ...mapState(['projections']),
    ...mapState('dataset', ['dataset', 'journal', 'nbApplications', 'nbVirtualDatasets']),
    ...mapState('session', ['user']),
    ...mapGetters('dataset', ['can', 'resourceUrl']),
    licenses() {
      return this.$store.getters.ownerLicenses(this.dataset.owner)
    },
    editProjection() {
      return !!(this.dataset && this.dataset.schema &&
        this.dataset.schema.find(p => p['x-refersTo'] === coordXUri) &&
        this.dataset.schema.find(p => p['x-refersTo'] === coordYUri))
    }
  },
  watch: {
    licenses() {
      if (!this.dataset.license) return
      // Matching object reference, so that the select components works
      this.dataset.license = this.licenses.find(l => l.href === this.dataset.license.href)
    },
    projections() {
      if (!this.dataset.projection) return
      // Matching object reference, so that the select components works
      this.dataset.projection = this.projections.find(l => l.code === this.dataset.projection.code)
    }
  },
  async mounted() {
    if (this.dataset) this.$store.dispatch('fetchLicenses', this.dataset.owner)
    if (this.editProjection) this.$store.dispatch('fetchProjections')

    // Ping the data endpoint to check that index is available
    try {
      this.data = await this.$axios.$get(this.resourceUrl + '/lines', { size: 0 })
    } catch (err) {
      // Do nothing, error should be added to the journal
    }
  },
  methods: {
    ...mapActions('dataset', ['patch', 'reindex'])
  }
}
</script>

<style lang="css">
</style>
