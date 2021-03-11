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
            <span>{{ catalog.updatedBy.name }} {{ catalog.updatedAt | moment("DD/MM/YYYY, HH:mm") }}</span>
          </v-list-item>
          <v-list-item>
            <v-list-item-avatar class="ml-0 my-0">
              <v-icon>mdi-plus-circle-outline</v-icon>
            </v-list-item-avatar>
            <span>{{ catalog.createdBy.name }} {{ catalog.createdAt | moment("DD/MM/YYYY, HH:mm") }}</span>
          </v-list-item>
        </v-list>
      </v-sheet>
    </v-col>
    <v-col
      cols="12"
      md="6"
      order-md="1"
    >
      <v-text-field
        v-model="catalog.title"
        label="Titre"
        :disabled="!can('writeDescription')"
        @change="patch({title: catalog.title})"
      />
      <v-textarea
        v-model="catalog.description"
        label="Description"
        :disabled="!can('writeDescription')"
        filled
        rows="4"
        @change="patch({description: catalog.description})"
      />
      <catalog-config-form :catalog="catalog" @change="changes => patch(changes)" />
    </v-col>
  </v-row>
</template>

<script>
  import OwnerListItem from '~/components/owners/list-item.vue'
  import { mapState, mapActions, mapGetters } from 'vuex'
  import CatalogConfigForm from '~/components/catalogs/config-form.vue'

  export default {
    components: { CatalogConfigForm, OwnerListItem },
    computed: {
      ...mapState('catalog', ['catalog']),
      ...mapGetters('catalog', ['can']),
    },
    methods: {
      ...mapActions('catalog', ['patch']),
    },
  }
</script>

<style lang="css">
</style>
