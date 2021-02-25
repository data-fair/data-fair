<template>
  <div class="applications-facets">
    <template v-if="facets.visibility">
      <v-select
        v-model="facetsValues.visibility"
        multiple
        label="Visibilité"
        :items="facets.visibility"
        item-value="value"
        :item-text="item => `${{public: 'Public', private: 'Privé', protected: 'Protégé'}[item.value]} (${item.count})`"
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
        :item-value="item => item.value.id"
        :item-text="item => `${item.value.title} (${item.count})`"
        outlined
        dense
        hide-details
        rounded
        class="mb-4"
      />
    </template>

    <template v-if="facets['base-application']">
      <v-select
        v-model="facetsValues['base-application']"
        multiple
        label="Application"
        :items="facets['base-application']"
        :item-value="item => item.value.url"
        :item-text="item => `${item.value.title} ${item.value.version || ''} (${item.count})`"
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
