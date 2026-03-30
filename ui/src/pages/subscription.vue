<template>
  <iframe
    v-if="$uiConfig.subscriptionUrl"
    :src="$uiConfig.subscriptionUrl"
    width="100%"
    style="height: 100%; border: none;"
  />
</template>
