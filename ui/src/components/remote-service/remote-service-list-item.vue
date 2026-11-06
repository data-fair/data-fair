<!-- eslint-disable vue/no-v-html -->
<template>
  <v-list-item
    :to="`/remote-service/${encodeURIComponent(remoteService.id ?? '')}`"
    lines="two"
  >
    <template #prepend>
      <resource-visibility
        :visibility="remoteService.public ? 'public' : 'private'"
        class="mr-2"
        size="small"
      />
    </template>
    <v-list-item-title :title="remoteService.title || remoteService.id">
      {{ remoteService.title || remoteService.id }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="remoteService.description">
      <div v-html="remoteService.description" />
    </v-list-item-subtitle>
    <template
      v-if="!remoteService.public && remoteService.privateAccess?.length"
      #append
    >
      <div class="d-flex flex-wrap ga-1">
        <owner-short
          v-for="owner in remoteService.privateAccess"
          :key="owner.id"
          :owner="owner"
        />
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { RemoteService } from '#api/types'

defineProps<{ remoteService: RemoteService }>()
</script>
