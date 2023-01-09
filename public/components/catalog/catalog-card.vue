<template>
  <v-card
    :to="`/catalog/${catalog.id}`"
    outlined
    tile
    hover
  >
    <v-card-title class="font-weight-bold">
      <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
        {{ catalog.title || catalog.id }}
      </span>
    </v-card-title>
    <v-card-text
      style="height:170px"
      class="py-0"
    >
      <v-clamp
        :max-height="170"
        class="card-desc170"
        autoresize
        v-html="catalog.description"
      />
    </v-card-text>
    <v-card-actions>
      <owner-short
        v-if="showOwner"
        :owner="catalog.owner"
        :ignore-department="true"
      />
      <owner-department
        v-if="showOwner || !activeAccount.department"
        :owner="catalog.owner"
      />
      <v-spacer />
    </v-card-actions>
  </v-card>
</template>

<script>
import VClamp from 'vue-clamp'

export default {
  components: { VClamp },
  props: ['catalog', 'showOwner']
}
</script>

<style lang="css" scoped>
.card-desc170:before {
  content:'';
  width:100%;
  height:82px;
  position:absolute;
  left:0;
  top:160px;
}
.theme--light .card-desc170:before {
  background:linear-gradient(transparent 0, white);
}
.theme--dark .card-desc170:before {
  background:linear-gradient(transparent 0, #1E1E1E);
}
</style>
