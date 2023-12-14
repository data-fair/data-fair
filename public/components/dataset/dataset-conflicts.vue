<template>
  <div v-if="conflicts && conflicts.length">
    <v-alert
      color="warning"
      outlined
      dense
      style="max-width:800px;"
      class="px-0 pb-0"
    >
      <span class="px-4">{{ $t('conflicts') }}</span>
      <v-list
        class="pb-0"
        color="transparent"
      >
        <v-list-item
          v-for="(conflict,i) in conflicts"
          :key="i"
        >
          <v-list-item-content class="py-0">
            <v-list-item-title>
              <a
                :href="$router.resolve(`/dataset/${conflict.dataset.id}`).href"
                target="_blank"
              >
                {{ conflict.dataset.title }}
              </a>
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ $t('conflict_' + conflict.conflict) }}
            </v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-alert>

    <v-checkbox
      v-model="ignoreConflicts"
      class="pl-2"
      :label="$t('ignoreConflicts')"
      color="warning"
      dense
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  conflicts: Doublons potentiels
  ignoreConflicts: Ignorer ces doublons potentiels
  conflict_filename: le nom de fichier est identique
  conflict_title: le titre est identique
en:
  conflicts: Potential duplicates
  ignoreConflits: Ignore these potentiel duplicates
  conflict_filename: the file name is the same
  conflict_title: the title is the same
</i18n>

<script>
import { mapGetters } from 'vuex'

export default {
  props: {
    dataset: { type: Object, required: true },
    file: { type: File, default: null }
  },
  data () {
    return {
      conflicts: null,
      ignoreConflicts: false
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount']),
    conflictsOk () {
      return this.ignoreConflicts || (this.conflicts && !this.conflicts.length)
    }
  },
  watch: {
    conflictsOk: {
      handler () {
        this.$emit('input', this.conflictsOk)
      },
      immediate: true
    }
  },
  mounted () {
    console.log('dataset-conflicts mounted')
  },
  created () {
    console.log('dataset-conflicts created')
    this.getConflicts()
  },
  methods: {
    async getConflicts () {
      const conflicts = []
      console.log('get conflicts')
      if (this.file) {
        console.log('get conflicts based on file name', this.file.name)
        const datasetFilenameConflicts = (await this.$axios.$get('api/v1/datasets', { params: { filename: this.file.name, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
        for (const dataset of datasetFilenameConflicts) conflicts.push({ dataset, conflict: 'filename' })
      }
      if (this.dataset.title) {
        console.log('get conflicts based on title', this.dataset.title)
        const datasetTitleConflicts = (await this.$axios.$get('api/v1/datasets', { params: { title: this.dataset.title, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title' } })).results
        for (const dataset of datasetTitleConflicts) conflicts.push({ dataset, conflict: 'title' })
      }
      this.conflicts = conflicts
    }
  }
}
</script>
