<!-- eslint-disable vue/no-v-html -->
<template>
  <v-card
    :to="`/remote-services/${encodeURIComponent(remoteService.id ?? '')}`"
    class="w-100 h-100 d-flex flex-column"
  >
    <v-card-title class="text-body-large font-weight-bold text-truncate">
      {{ remoteService.title || remoteService.id }}
    </v-card-title>
    <v-card-text class="flex-grow-1">
      <div
        v-if="remoteService.description"
        class="text-body-medium text-medium-emphasis card-description"
        v-html="remoteService.description"
      />
    </v-card-text>
    <v-card-subtitle class="text-body-small pb-3 d-flex align-center">
      <resource-visibility :visibility="remoteService.public ? 'public' : 'protected'" />
      <template v-if="!remoteService.public && remoteService.privateAccess">
        <span
          v-for="owner in remoteService.privateAccess"
          :key="owner.id"
          class="ml-2"
        >
          <owner-short :owner="owner" />
        </span>
      </template>
    </v-card-subtitle>
  </v-card>
</template>

<script setup lang="ts">
import { RemoteService } from '#api/types'

defineProps<{ remoteService: RemoteService }>()
</script>

<style lang="css" scoped>
.card-description {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
