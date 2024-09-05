<template>
  <div>
    <dataset-select
      v-model="initFromDataset"
      :label="$t('initFromDataset')"
      :extra-params="{queryable: true, select: ''}"
      master-data="standardSchema"
      class="mt-2"
      @change="setInitFrom"
    />

    <template v-if="dataset.initFrom">
      <v-checkbox
        v-if="allowData"
        :value="dataset.initFrom.parts.includes('data')"
        hide-details
        class="pl-2"
        :label="$t('initFromData')"
        @change="toggleInitFromPart('data')"
      />
      <v-checkbox
        :value="dataset.initFrom.parts.includes('schema')"
        hide-details
        class="pl-2"
        :label="$t('initFromSchema')"
        :disabled="dataset.initFrom.parts.includes('data')"
        @change="toggleInitFromPart('schema')"
      />
      <v-checkbox
        v-if="initFromDataset.extensions?.length"
        :value="dataset.initFrom.parts.includes('extensions')"
        hide-details
        class="pl-2"
        :label="$t('initFromExtensions')"
        @change="toggleInitFromPart('extensions')"
      />
      <v-checkbox
        v-if="initFromDataset.attachments?.length"
        :value="dataset.initFrom.parts.includes('metadataAttachments')"
        hide-details
        class="pl-2"
        :label="$t('initFromAttachments')"
        @change="toggleInitFromPart('metadataAttachments')"
      />
      <v-checkbox
        :value="dataset.initFrom.parts.includes('description')"
        hide-details
        class="pl-2"
        :label="$t('initFromDescription')"
        @change="toggleInitFromPart('description')"
      />
    </template>
  </div>
</template>

<i18n lang="yaml">
    fr:
      initFromDataset: Utiliser un jeu de données existant pour initialiser le nouveau ?
      initFromData: copier la donnée
      initFromSchema: copier le schéma
      initFromPrimaryKey: copier la clé primaire
      initFromExtensions: copier les extensions
      initFromDescription: copier la description
      initFromAttachments: copier les pièces jointes
    en:
      initFromDataset: Use an existing dataset to initialize the new one ?
      initFromData: copy data
      initFromSchema: copy schema
      initFromPrimaryKey: copy primary key
      initFromExtensions: copy extensions
      initFromDescription: copy description
      initFromAttachments: copy attachments
</i18n>

<script>
export default {
  props: {
    dataset: {
      type: Object,
      required: true
    },
    allowData: {
      type: Boolean,
      default: true
    }
  },
  data: () => ({
    initFromDataset: null
  }),
  methods: {
    setInitFrom (dataset) {
      if (dataset) {
        const initFrom = { dataset: dataset.id, parts: [] }
        this.$set(this.dataset, 'initFrom', initFrom)
      } else {
        this.$delete(this.dataset, 'initFrom')
      }
    },
    toggleInitFromPart (part) {
      const initFrom = this.dataset.initFrom
      if (initFrom.parts.includes(part)) {
        initFrom.parts = initFrom.parts.filter(p => p !== part)
      } else {
        initFrom.parts.push(part)
        if (part === 'data' && !initFrom.parts.includes('schema')) {
          initFrom.parts.push('schema')
        }
      }
    }
  }
}
</script>
