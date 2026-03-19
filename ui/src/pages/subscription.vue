<template>
  <iframe
    v-if="$uiConfig.subscriptionUrl"
    :src="$uiConfig.subscriptionUrl"
    width="100%"
    :style="{ height: iframeHeight }"
    frameborder="0"
    @load="onLoad"
  />
</template>

<script lang="ts" setup>
const iframeHeight = ref('600px')

function onLoad (e: Event) {
  const iframe = e.target as HTMLIFrameElement
  try {
    const height = iframe.contentWindow?.document.body.scrollHeight
    if (height) iframeHeight.value = height + 'px'
  } catch {}
}
</script>
