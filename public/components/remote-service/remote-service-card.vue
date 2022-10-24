<template>
  <v-card
    :to="`/remote-service/${remoteService.id}`"
    outlined
    tile
    hover
  >
    <v-card-title class="font-weight-bold">
      {{ remoteService.title || remoteService.id }}
    </v-card-title>
    <v-card-text
      style="height:170px"
      class="py-0"
    >
      <v-clamp
        :max-height="170"
        class="card-desc170"
        autoresize
        v-html="remoteService.description"
      />
    </v-card-text>
    <v-card-actions>
      <visibility :visibility="remoteService.public ? 'public' : 'protected'" />
      <template v-if="!remoteService.public && remoteService.privateAccess">
        <div
          v-for="owner in remoteService.privateAccess"
          :key="owner.id"
          class="ml-2"
        >
          <owner-short :owner="owner" />
        </div>
      </template>
    </v-card-actions>
  </v-card>
</template>

<script>
import VClamp from 'vue-clamp'

export default {
  components: { VClamp },
  props: ['remoteService']
}
</script>

<style lang="css" scoped>
.card-desc170 {
  position: relative;
}
.card-desc170:before {
  content:'';
  position:absolute;
  width:100%;
  height:170px;
  left:0;
  top:0;
}
.theme--light .card-desc170:before {
  background:linear-gradient(transparent 0, transparent 70%, white);
}
.theme--dark .card-desc170:before {
  background:linear-gradient(transparent 0, transparent 70%, #1E1E1E);
}
</style>
