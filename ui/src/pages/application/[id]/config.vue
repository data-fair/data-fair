<template>
  <application-config />
</template>

<script lang="ts" setup>
import { provideApplicationStore } from '~/composables/application-store'

const route = useRoute<'/application/[id]/config'>()

provideApplicationStore(route.params.id)
</script>
