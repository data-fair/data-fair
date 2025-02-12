<template>
  <v-container>
    <h2 class="text-h4 mb-4">
      Data Fair application config - TODO
    </h2>
    {{ applicationFetch.data.value?.title }}
  </v-container>
</template>

<script setup lang="ts">
import { Application } from '#api/types'

const route = useRoute<'/embed/application/[id]/config'>()

const applicationFetch = useFetch<Application>($apiPath + `/applications/${route.params.id}`)
</script>

<style>
</style>
