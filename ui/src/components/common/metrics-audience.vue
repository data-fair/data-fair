<template>
  <!-- the audience of one resource, served by the metrics service: the iframe grows with its content -->
  <d-frame
    :src="src"
    @notif="(e: any) => sendUiNotif(frameNotifArg(e.detail))"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  resourceType: 'dataset' | 'application'
  resourceId: string
}>()

const { sendUiNotif } = useUiNotif()

const src = computed(() => {
  return `${window.location.origin}/metrics/embed/${props.resourceType}/${encodeURIComponent(props.resourceId)}`
})
</script>
