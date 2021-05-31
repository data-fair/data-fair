<template>
  <div class="datasets-facets">
    <template v-if="facets.owner">
      <v-select
        v-model="facetsValues.owner"
        multiple
        label="Propriétaire"
        :items="facets.owner"
        :item-value="item => item.value && `${item.value.type}:${item.value.id}`"
        :item-text="item => item.value && `${item.value.name} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.visibility && !env.disableSharing">
      <v-select
        v-model="facetsValues.visibility"
        multiple
        label="Visibilité"
        :items="facets.visibility"
        item-value="value"
        :item-text="item => item.value && `${{public: 'Public', private: 'Privé', protected: 'Protégé'}[item.value]} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.status">
      <v-select
        v-model="facetsValues.status"
        multiple
        label="État"
        :items="facets.status"
        item-value="value"
        :item-text="item => item.value && `${statuses.dataset[item.value] ? statuses.dataset[item.value].title : item.value} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.topics">
      <v-select
        v-model="facetsValues.topics"
        multiple
        label="Thématiques"
        :items="facets.topics"
        :item-value="item => item.value && item.value.id"
        :item-text="item => item.value && `${item.value.title} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.services">
      <v-select
        v-model="facetsValues.services"
        multiple
        label="Enrichissement"
        :items="facets.services"
        item-value="value"
        :item-text="item => item.value && `${item.value.replace('koumoul-', '').replace('-koumoul', '')} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets.concepts">
      <v-select
        v-model="facetsValues.concepts"
        multiple
        label="Concepts"
        :items="facets.concepts.filter(facetItem => vocabulary && vocabulary[facetItem.value])"
        item-value="value"
        :item-text="item => item.value && `${vocabulary && vocabulary[item.value] && vocabulary[item.value].title} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>
  </div>
</template>

<script>
  import { mapState } from 'vuex'
  import statuses from '../../../shared/statuses.json'

  export default {
    props: ['facets', 'facetsValues'],
    data() {
      return { statuses, visibleFacet: 'visibility' }
    },
    computed: {
      ...mapState(['vocabulary', 'env']),
    },
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
