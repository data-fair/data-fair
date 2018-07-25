<template lang="html">
  <v-container fluid grid-list-lg>
    <v-layout row wrap>
      <v-flex xs12 md6 order-md2>
        <v-card class="mb-3">
          <v-list>
            <v-list-tile>
              <v-list-tile-avatar>
                <v-icon v-if="catalog.owner.type === 'user'">person</v-icon>
                <v-icon v-else>group</v-icon>
              </v-list-tile-avatar>
              <span>{{ catalog.owner.name }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>link</v-icon></v-list-tile-avatar>
              <span><a :href="catalog.url">{{ catalog.url }}</a></span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>update</v-icon></v-list-tile-avatar>
              <span>{{ catalog.updatedBy.name }} {{ catalog.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>add_circle_outline</v-icon></v-list-tile-avatar>
              <span>{{ catalog.createdBy.name }} {{ catalog.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
          </v-list>
        </v-card>
      </v-flex>
      <v-flex xs12 md6 order-md1>
        <v-text-field label="Titre" v-model="catalog.title" @blur="patch({title: catalog.title})"/>
        <v-textarea label="Description" v-model="catalog.description" box rows="4" @blur="patch({description: catalog.description})"/>
        <catalog-config-form :catalog="catalog" @change="changes => patch(changes)"/>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
import {mapState, mapActions} from 'vuex'
import CatalogConfigForm from '../../../components/CatalogConfigForm.vue'

export default {
  components: {CatalogConfigForm},
  computed: {
    ...mapState('catalog', ['catalog'])
  },
  methods: {
    ...mapActions('catalog', ['patch'])
  }
}
</script>

<style lang="css">
</style>
