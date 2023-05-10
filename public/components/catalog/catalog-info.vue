<template lang="html">
  <v-row>
    <v-col
      cols="12"
      md="6"
      order-md="2"
    >
      <v-sheet>
        <v-list dense>
          <owner-list-item :owner="catalog.owner" />
          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-link</v-icon>
            </v-list-item-avatar>
            <span><a :href="catalog.url">{{ catalog.url }}</a></span>
          </v-list-item>
          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-pencil</v-icon>
            </v-list-item-avatar>
            <span>{{ catalog.updatedBy.name }} {{ catalog.updatedAt | moment("lll") }}</span>
          </v-list-item>
          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-plus-circle-outline</v-icon>
            </v-list-item-avatar>
            <span>{{ catalog.createdBy.name }} {{ catalog.createdAt | moment("lll") }}</span>
          </v-list-item>
        </v-list>
      </v-sheet>
    </v-col>
    <v-col
      cols="12"
      md="6"
      order-md="1"
    >
      <catalog-config-form
        :catalog="catalog"
        @change="changes => patch(changes)"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  title: Titre
  description: Description
en:
  title: Title
  description: Description
</i18n>

<script>
import { mapState, mapActions, mapGetters } from 'vuex'

export default {
  computed: {
    ...mapState('catalog', ['catalog']),
    ...mapGetters('catalog', ['can'])
  },
  methods: {
    ...mapActions('catalog', ['patch'])
  }
}
</script>

<style lang="css">
</style>
