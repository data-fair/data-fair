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
                <v-icon v-if="catalog.owner.type === 'user'">
                  person
                </v-icon>
                <v-icon v-else>
                  group
                </v-icon>
              </v-list-item-avatar>
              <span>{{ catalog.owner.name }}</span>
            </v-list-item>
            <v-list-item>
              <v-list-item-avatar><v-icon>link</v-icon></v-list-item-avatar>
              <span><a :href="catalog.url">{{ catalog.url }}</a></span>
            </v-list-item>
            <v-list-item>
              <v-list-item-avatar><v-icon>mdi-pencil</v-icon></v-list-item-avatar>
              <span>{{ catalog.updatedBy.name }} {{ catalog.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
            </v-list-item>
            <v-list-item>
              <v-list-item-avatar><v-icon>mdi-plus-circle-outline</v-icon></v-list-item-avatar>
              <span>{{ catalog.createdBy.name }} {{ catalog.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
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
          v-model="catalog.title"
          label="Titre"
          @change="patch({title: catalog.title})"
        />
        <v-textarea
          v-model="catalog.description"
          label="Description"
          box
          rows="4"
          @change="patch({description: catalog.description})"
        />
        <catalog-config-form
          :catalog="catalog"
          @change="changes => patch(changes)"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapState, mapActions } from 'vuex'
  import CatalogConfigForm from '~/components/CatalogConfigForm.vue'

  export default {
    components: { CatalogConfigForm },
    computed: {
      ...mapState('catalog', ['catalog']),
    },
    methods: {
      ...mapActions('catalog', ['patch']),
    },
  }
</script>

<style lang="css">
</style>
