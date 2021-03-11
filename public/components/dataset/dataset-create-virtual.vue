<template>
  <v-col>
    <p class="mt-3">
      Un jeu de données virtuel est une représentation alternative de un ou plusieurs autres jeux de données.
      Vous pouvez les utiliser pour créer des vues limitées d'un jeu de données en appliquant des filtres ou en choisissant une partie seulement des colonnes.
      Vous pouvez également agréger plusieurs jeux de données en une seule représentation.
    </p>
    <v-form
      ref="form"
      v-model="valid"
      style="max-width: 500px;"
    >
      <v-text-field
        v-model="title"
        :required="true"
        :rules="[value => !!(value.trim()) || 'le titre est obligatoire, il sea utilisé pour créer un identifiant au nouveau jeu de données']"
        name="title"
        label="Titre"
      />
      <v-autocomplete
        v-model="children"
        :items="datasets"
        :loading="loadingDatasets"
        :search-input.sync="search"
        :required="true"
        :rules="[value => !!(value && value.length) || '']"
        hide-no-data
        item-text="title"
        item-value="id"
        label="Jeux enfants"
        placeholder="Recherchez"
        return-object
        multiple
      />
    </v-form>
    <v-btn
      color="primary"
      class="mt-4"
      @click.native="validate"
    >
      Créer
    </v-btn>
  </v-col>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import eventBus from '~/event-bus'

  export default {
    data: () => ({
      valid: false,
      currentStep: null,
      title: '',
      children: [],
      loadingDatasets: false,
      search: '',
      datasets: [],
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      ...mapGetters('session', ['activeAccount']),
    },
    watch: {
      search() {
        this.searchDatasets()
      },
    },
    methods: {
      async searchDatasets() {
        this.loadingDatasets = true
        const res = await this.$axios.$get('api/v1/datasets', {
          params: { q: this.search, size: 20, select: 'id,title', status: 'finalized', owner: `${this.activeAccount.type}:${this.activeAccount.id}` },
        })
        this.datasets = this.children.concat(res.results.filter(d => !this.children.find(c => c.id === d.id)))
        this.loadingDatasets = false
      },
      async validate() {
        if (!this.$refs.form.validate()) return
        try {
          const dataset = await this.$axios.$post('api/v1/datasets', { isVirtual: true, title: this.title, virtual: { children: this.children.map(c => c.id) } })
          this.$router.push({ path: `/dataset/${dataset.id}` })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la création du jeu de données virtual :' })
        }
      },
    },
  }
</script>
