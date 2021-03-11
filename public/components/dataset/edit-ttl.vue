<template>
  <v-menu
    v-if="editTtl"
    v-model="show"
    :close-on-content-click="false"
  >
    <template v-slot:activator="{on}">
      <v-btn
        icon
        color="warning"
        v-on="on"
      >
        <v-icon>mdi-pencil</v-icon>
      </v-btn>
    </template>
    <v-sheet>
      <v-alert
        type="warning"
        :value="true"
        tile
        dense
        text
        :icon="false"
        class="mb-0 mt-1"
      >
        Si vous configurez l'expiration automatique, les lignes supprimées ne pourront pas être récupérées.
      </v-alert>
      <v-card-text>
        <v-checkbox v-model="editTtl.active" label="activer l'expiration automatique" />
        <v-select
          v-model="editTtl.prop"
          label="colonne de date de référence"
          :items="schema.filter(prop => prop.format === 'date-time')"
          item-value="key"
          :item-text="(field) => field.title || field['x-originalName'] || field.key"
        />
        <v-text-field
          v-model.number="editTtl.delay.value"
          type="number"
          label="nombre de jours avant expiration depuis la date de référence"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text @click="show = false">
          annuler
        </v-btn>
        <v-btn color="warning" @click="change">
          enregistrer
        </v-btn>
      </v-card-actions>
    </v-sheet>
  </v-menu>
</template>

<script>
  export default {
    props: ['ttl', 'schema'],
    data: () => ({
      show: false,
      editTtl: null,
    }),
    watch: {
      ttl: {
        immediate: true,
        handler() {
          this.editTtl = JSON.parse(JSON.stringify(this.ttl))
        },
      },
    },
    methods: {
      change() {
        this.editTtl.delay.value = this.editTtl.delay.value || 0
        this.$emit('change', this.editTtl)
        this.show = false
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
