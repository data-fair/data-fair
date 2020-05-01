<template lang="html">
  <v-container
    fluid
    grid-list-lg
  >
    <v-row>
      <v-col
        cols="12"
        md="6"
        order-md="2"
      >
        <v-card class="mb-3">
          <v-list>
            <v-list-item>
              <v-list-item-avatar>
                <v-icon v-if="application.owner.type === 'user'">
                  person
                </v-icon>
                <v-icon v-else>
                  group
                </v-icon>
              </v-list-item-avatar>
              <span>{{ application.owner.name }}</span>
            </v-list-item>
            <v-list-item
              v-if="journal[0]"
              :class="'event-' + journal[0].type"
            >
              <v-list-item-avatar>
                <v-icon>{{ events[journal[0].type].icon }}</v-icon>
              </v-list-item-avatar>
              <p v-if="journal[0].type === 'error'">
                {{ events[journal[0].type].text }} <br> {{ journal[0].data }}
              </p>
              <span v-else>{{ events[journal[0].type].text }}</span>
            </v-list-item>
            <v-list-item>
              <v-list-item-avatar><v-icon>mdi-pencil</v-icon></v-list-item-avatar>
              <span>{{ application.updatedBy.name }} {{ application.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-item>
            <v-list-item>
              <v-list-item-avatar><v-icon>mdi-plus-circle-outline</v-icon></v-list-item-avatar>
              <span>{{ application.createdBy.name }} {{ application.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-item>
            <v-list-item v-if="nbSessions !== null">
              <v-list-item-avatar><v-icon>visibility</v-icon></v-list-item-avatar>
              <span>{{ nbSessions }} {{ nbSessions > 1 ? 'sessions actives dans la dernière heure' : 'session active dans la dernière heure' }}</span>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
      <v-col
        cols="12"
        md="6"
        order-md="1"
      >
        <v-text-field
          v-model="application.title"
          label="Titre"
          @change="patch({title: application.title})"
        />
        <v-textarea
          v-model="application.description"
          label="Description"
          box
          rows="4"
          @change="patch({description: application.description})"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapState, mapActions } from 'vuex'
  const events = require('../../../../shared/events.json').application

  export default {
    data() {
      return { events }
    },
    computed: {
      ...mapState('application', ['application', 'nbSessions', 'journal']),
    },
    methods: {
      ...mapActions('application', ['patch']),
    },
  }
</script>

<style lang="css">
</style>
