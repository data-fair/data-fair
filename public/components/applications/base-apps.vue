<template>
  <v-container
    v-if="baseApps"
    fluid
    class="pa-0"
  >
    <template v-for="category in categories">
      <h3 :key="category" class="text-h6">
        {{ 'Visualisation de type '+category }}
      </h3>
      <v-row :key="'layout-'+category">
        <v-col
          v-for="baseApp in configurableApps.filter(a => a.category === category)"
          :key="baseApp.id"
          md="3"
          sm="4"
          cols="6"
        >
          <v-tooltip top :activator="`#baseapp-${baseApp._id}`">
            <span v-if="baseApp.description">{{ baseApp.description }}</span>
            <br v-if="baseApp.description && baseApp.disabled.length">
            <span v-if="baseApp.disabled.length">{{ baseApp.disabled.join('\n') }}</span>
          </v-tooltip>
          <base-app-card
            :id="`baseapp-${baseApp._id}`"
            :base-app="baseApp"
            :selected="value && value._id === baseApp._id"
            @click="$emit('input', baseApp)"
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<script>
  import { mapGetters, mapState } from 'vuex'
  import BaseAppCard from '~/components/applications/base-app-card.vue'

  export default {
    components: { BaseAppCard },
    props: ['dataset', 'value'],
    data: () => ({
      baseApps: null,
    }),
    computed: {
      ...mapState(['env', 'vocabulary']),
      ...mapGetters('session', ['activeAccount']),
      categories() {
        return this.env.baseAppsCategories.concat('autre')
          .filter(c => this.baseApps && this.baseApps.filter(b => b.category === c).length)
      },
      configurableApps() {
        return (this.baseApps || []).map(app => {
          const application = { ...app }
          application.disabled = []
          application.category = application.category || 'autre'
          if (this.dataset && (!application.datasetsFilters || !application.datasetsFilters.length)) {
            application.disabled.push('Cette application n\'utilise pas de sources de données de type fichier.')
          } else {
            if (application.datasetsFilters && application.datasetsFilters.length && !this.dataset) {
              application.disabled.push('Cette application nécessite une source de données.')
            } else {
              (application.datasetsFilters || []).forEach(filter => {
                if (filter.bbox && !this.dataset.bbox) application.disabled.push('Cette application nécessite une source avec des données géolocalisées.')
                if (filter.concepts) {
                  const foundConcepts = []
                  filter.concepts.forEach(concept => {
                    if (this.vocabulary[concept]) foundConcepts.push(concept)
                  })
                  if (!foundConcepts.length) application.disabled.push(`Cette application nécessite une source avec un champ de concept ${filter.concepts.map(concept => this.concepts.find(c => c.id === concept).title).join(' ou ')}.`)
                }
                if (filter['field-type'] && (!this.dataset.schema || !this.dataset.schema.find(p => filter['field-type'].includes(p.type)))) {
                  application.disabled.push(`Cette application nécessite une source avec un champ de type ${filter['field-type'].join(' ou ')}.`)
                }
              })
            }
          }
          return application
        })
      },
    },
    async created() {
      const privateAccess = this.activeAccount.type + ':' + this.activeAccount.id
      const baseApps = (await this.$axios.get('api/v1/base-applications', { params: { size: 1000, privateAccess } })).data.results
      this.baseApps = baseApps
    },
  }
</script>

<style lang="css" scoped>
</style>
