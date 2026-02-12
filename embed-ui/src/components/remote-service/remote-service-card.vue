<!-- eslint-disable vue/no-v-html -->
<template>
  <v-card
    :to="`/remote-service/${remoteService.id}`"
    border
    tile
    hover
  >
    <v-card-title
      class="font-weight-bold"
      :title="remoteService.title"
    >
      {{ remoteService.title || remoteService.id }}
    </v-card-title>
    <v-card-text
      style="height:170px; overflow-y:hidden"
      class="py-0"
    >
      <div
        :max-height="170"
        class="card-desc170"
        autoresize
        v-html="remoteService.description"
      />
    </v-card-text>
    <v-card-actions>
      <resource-visibility :visibility="remoteService.public ? 'public' : 'protected'" />
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

<script lang="ts" setup>
import { RemoteService } from '#api/types'

defineProps<{ remoteService: RemoteService }>()
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
