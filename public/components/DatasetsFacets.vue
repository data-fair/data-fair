<template>
  <div class="datasets-facets">
    <!--valeurs cochées : {{ facetsValues }}
    <br>
    valeurs retournées : {{ facets }}-->

    <template v-if="facets.owner && facets.owner.length">
      <v-subheader>Propriétaire</v-subheader>
      <v-checkbox
        v-for="facetItem in facets.owner" :key="`${facetItem.value.type}:${facetItem.value.id}`"
        v-model="facetsValues.owner[`${facetItem.value.type}:${facetItem.value.id}`]" :value="true"
        :hide-details="true"
        class="mt-0"
      >
        <span slot="label">
          <v-icon v-if="facetItem.value.type === 'user'">person</v-icon>
          <v-icon v-if="facetItem.value.type === 'organization'">group</v-icon>
          {{ facetItem.value.name }}
          ({{ facetItem.count }})
        </span>
      </v-checkbox>
    </template>

    <template v-if="facets.visibility && facets.visibility.length">
      <v-subheader>Visibilité</v-subheader>
      <v-checkbox
        v-for="facetItem in facets.visibility" :key="`${facetItem.value}`"
        v-model="facetsValues.visibility[facetItem.value]" :label="`${{public: 'Public', private: 'Privé', protected: 'Protégé'}[facetItem.value]} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>

    <template v-if="facets.status && facets.status.length">
      <v-subheader>État</v-subheader>
      <v-checkbox
        v-for="facetItem in facets.status" :key="facetItem.value"
        v-model="facetsValues.status[facetItem.value]" :label="`${statuses.dataset[facetItem.value] ? statuses.dataset[facetItem.value].title : facetItem.value} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>

    <template v-if="facets.services && facets.services.length">
      <v-subheader>Enrichissement</v-subheader>
      <v-checkbox
        v-for="facetItem in facets.services" :key="facetItem.value"
        v-model="facetsValues.services[facetItem.value]" :label="`${facetItem.value.replace('koumoul-', '').replace('-koumoul', '')} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>

    <template v-if="facets.concepts && facets.concepts.length">
      <v-subheader>Concepts</v-subheader>
      <v-checkbox
        v-for="facetItem in facets.concepts" :key="facetItem.value"
        v-model="facetsValues.concepts[facetItem.value]" :label="`${vocabulary && vocabulary[facetItem.value].title} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import statuses from '../../shared/statuses.json'

export default {
  props: ['facets', 'facetsValues'],
  data() {
    return { statuses }
  },
  computed: {
    ...mapState(['vocabulary'])
  }
}
</script>

<style lang="less">
  .datasets-facets {
    .v-subheader:not(:first-child) {
      margin-top: 16px;
    }
    .v-subheader {
      padding-left: 0;
      height: 20px;
    }
  }

</style>
