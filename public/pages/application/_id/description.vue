<template lang="html">
  <v-container fluid grid-list-lg>
    <v-layout row wrap>
      <v-flex xs12 md6 order-md2>
        <v-card class="mb-3">
          <v-list>
            <v-list-tile>
              <v-list-tile-avatar>
                <v-icon v-if="application.owner.type === 'user'">person</v-icon>
                <v-icon v-else>group</v-icon>
              </v-list-tile-avatar>
              <span>{{ application.owner.name }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>update</v-icon></v-list-tile-avatar>
              <span>{{ application.updatedBy.name }} {{ application.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
            <v-list-tile>
              <v-list-tile-avatar><v-icon>add_circle_outline</v-icon></v-list-tile-avatar>
              <span>{{ application.createdBy.name }} {{ application.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-tile>
          </v-list>
        </v-card>
      </v-flex>
      <v-flex xs12 md6 order-md1>
        <v-text-field label="Titre" v-model="application.title" @blur="patch({title: application.title})"/>
        <v-textarea label="Description" v-model="application.description" box rows="4" @blur="patch({description: application.description})"/>
        <v-text-field label="Adresse" v-model="application.url" @blur="patch({url: application.url})"/>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
import {mapState, mapActions} from 'vuex'
export default {
  computed: {
    ...mapState('application', ['application'])
  },
  methods: {
    ...mapActions('application', ['patch'])
  }
}
</script>

<style lang="css">
</style>
