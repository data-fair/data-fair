<template>
  <div class="applications-facets">
    <!--valeurs cochées : {{ facetsValues }}
    <br>
    valeurs retournées : {{ facets }}-->

    <!--<template v-if="facets.owner && facets.owner.length">
      <v-subheader @click="visibleFacet = 'owner'">
        Propriétaire
        <v-icon v-if="visibleFacet !== 'owner'">
          mdi-menu-down
        </v-icon>
      </v-subheader>
      <template v-if="visibleFacet === 'owner'">
        <v-checkbox
          v-for="facetItem in facets.owner"
          :key="`${facetItem.value.type}:${facetItem.value.id}`"
          v-model="facetsValues.owner[`${facetItem.value.type}:${facetItem.value.id}`]"
          :value="true"
          :hide-details="true"
          class="mt-0"
        >
          <span slot="label">
            <v-icon v-if="facetItem.value.type === 'user'">mdi-account</v-icon>
            <v-icon v-if="facetItem.value.type === 'organization'">mdi-account-group</v-icon>
            {{ facetItem.value.name }}
            ({{ facetItem.count }})
          </span>
        </v-checkbox>
      </template>
    </template>-->

    <template v-if="facets.visibility && facets.visibility.length">
      <v-subheader @click="visibleFacet = 'visibility'">
        Visibilité
      </v-subheader>
      <v-checkbox
        v-for="facetItem in facets.visibility"
        :key="`${facetItem.value}`"
        v-model="facetsValues.visibility[facetItem.value]"
        :label="`${{public: 'Public', private: 'Privé', protected: 'Protégé'}[facetItem.value]} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>

    <template v-if="facets['base-application'] && facets['base-application'].length">
      <v-subheader @click="visibleFacet = 'base-application'">
        Application
      </v-subheader>
      <v-checkbox
        v-for="facetItem in facets['base-application']"
        :key="`${facetItem.value}`"
        v-model="facetsValues['base-application'][facetItem.value.url]"
        :label="`${facetItem.value.title} ${facetItem.value.version || ''} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>

    <template v-if="facets.topics && facets.topics.length">
      <v-subheader @click="visibleFacet = 'topics'">
        Thématiques
      </v-subheader>
      <v-checkbox
        v-for="facetItem in facets.topics"
        :key="facetItem.value.id"
        v-model="facetsValues.topics[facetItem.value.id]"
        :label="`${facetItem.value.title} (${facetItem.count})`"
        :value="true"
        :hide-details="true"
        class="mt-0"
      />
    </template>
  </div>
</template>

<script>
  import { mapState } from 'vuex'

  export default {
    props: ['facets', 'facetsValues'],
    data() {
      return { visibleFacet: 'visibility' }
    },
    computed: {
      ...mapState(['vocabulary']),
    },
  }
</script>

<style lang="less">
  .applications-facets {
    .v-subheader {
      cursor: pointer;
    }
    .v-subheader:not(:first-child) {
      margin-top: 16px;
    }
    .v-subheader {
      padding-left: 0;
      height: 20px;
    }
  }

</style>
