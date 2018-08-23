<template lang="html">
  <v-container fluid grid-list-lg>
    <v-layout row wrap>
      <v-flex xs12 md6 order-md2>
        <v-card class="mb-3">
          <v-list>
            <v-list-tile>
              <v-list-tile-avatar>
                <v-icon v-if="dataset.owner.type === 'user'">person</v-icon>
                <v-icon v-else>group</v-icon>
              </v-list-tile-avatar>
              <span>{{ dataset.owner.name }}</span>
            </v-list-tile>
            <v-list-tile v-if="journal[0]" :class="'event-' + journal[0].type">
              <v-list-tile-avatar v-if="['finalize-end', 'error', 'publication'].includes(journal[0].type)">
                <v-icon>{{ events[journal[0].type].icon }}</v-icon>
              </v-list-tile-avatar>
              <v-list-tile-avatar v-else>
                <v-progress-circular :size="20" :width="3" small indeterminate color="primary"/>
              </v-list-tile-avatar>
              <span>{{ events[journal[0].type].text }}</span>
              <v-spacer/>
              <v-list-tile-action v-if="journal[0].type === 'error'">
                <v-btn icon title="Relancer" @click="patch({})">
                  <v-icon>play_arrow</v-icon>
                </v-btn>
              </v-list-tile-action>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>insert_drive_file</v-icon></v-list-tile-avatar>
              <span>{{ (dataset.originalFile || dataset.file).name }} {{ ((dataset.originalFile || dataset.file).size / 1000).toFixed(2) }} ko</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>update</v-icon></v-list-tile-avatar>
              <span>{{ dataset.updatedBy.name }} {{ dataset.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>add_circle_outline</v-icon></v-list-tile-avatar>
              <span>{{ dataset.createdBy.name }} {{ dataset.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>view_headline</v-icon></v-list-tile-avatar>
              <span>{{ dataset.count }} enregistrements</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar v-if="nbApplications === null">
                <v-progress-circular :size="20" :width="3" small indeterminate color="primary"/>
              </v-list-tile-avatar>
              <template v-else>
                <v-list-tile-avatar ><v-icon>touch_app</v-icon></v-list-tile-avatar>
                <span v-if="nbApplications === 0">0 application</span>
                <nuxt-link v-else :to="`/applications?dataset=${dataset.id}`">{{ nbApplications }} application{{ nbApplications > 1 ? 's' : '' }}</nuxt-link>
              </template>
            </v-list-tile>
          </v-list>
        </v-card>
      </v-flex>
      <v-flex xs12 md6 order-md1>
        <v-text-field label="Titre" v-model="dataset.title" @blur="patch({title: dataset.title})" :disabled="!can('writeDescription')"/>
        <v-textarea label="Description" v-model="dataset.description" box rows="4" @blur="patch({description: dataset.description})" :disabled="!can('writeDescription')"/>
        <v-select
          :items="licenses"
          item-text="title"
          item-key="href"
          v-model="dataset.license"
          label="Licence"
          return-object
          @input="patch({license: dataset.license})"
          :disabled="!can('writeDescription')"
        />
        <v-text-field label="Provenance" v-model="dataset.origin" @blur="patch({origin: dataset.origin})" :disabled="!can('writeDescription')"/>
      </v-flex>

    </v-layout>
  </v-container>
</template>

<script>
const {mapState, mapActions, mapGetters} = require('vuex')
const events = require('../../shared/events.json').dataset

export default {
  data() {
    return { events }
  },
  computed: {
    ...mapState('dataset', ['dataset', 'journal', 'nbApplications']),
    ...mapGetters('dataset', ['can']),
    licenses() {
      return this.$store.getters.ownerLicenses(this.dataset.owner)
    }
  },
  watch: {
    licenses() {
      if (!this.dataset.license) return
      // Matching object reference, so that the select components works
      this.dataset.license = this.licenses.find(l => l.href === this.dataset.license.href)
    }
  },
  mounted() {
    this.$store.dispatch('fetchLicenses', this.dataset.owner)
  },
  methods: {
    ...mapActions('dataset', ['patch'])
  }
}
</script>

<style lang="css">
</style>
