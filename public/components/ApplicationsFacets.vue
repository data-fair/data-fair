<template>
  <div class="applications-facets">
    <!--valeurs cochées : {{ facetsValues }}
    <br>
    valeurs retournées : {{ facets }}-->

    <v-subheader>Propriétaire</v-subheader>
    <v-checkbox
      v-for="facetItem in facets.owner" :key="`${facetItem.value.type}:${facetItem.value.id}`"
      :value="true" v-model="facetsValues.owner[`${facetItem.value.type}:${facetItem.value.id}`]"
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

    <v-subheader>Visibilité</v-subheader>
    <v-checkbox
      v-for="facetItem in facets.visibility" :key="`${facetItem.value}`"
      :label="`${facetItem.value === 'public' ? 'Publique' : 'Privée'} (${facetItem.count})`" :value="true"
      v-model="facetsValues.visibility[facetItem.value]"
      :hide-details="true"
      class="mt-0"
    />

  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: ['facets', 'facetsValues'],
  data() {
    return { }
  },
  computed: {
    ...mapState(['vocabulary'])
  }
}
</script>

<style lang="less">
  .applications-facets {
    .v-subheader:not(:first-child) {
      margin-top: 16px;
    }
    .v-subheader {
      padding-left: 0;
      height: 20px;
    }
  }

</style>
