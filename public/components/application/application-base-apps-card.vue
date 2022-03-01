<template>
  <v-tooltip
    top
    content-class="base-app-tooltip"
  >
    <span v-if="baseApp.description">{{ baseApp.description }}</span>
    <template v-for="(disabled, i) in baseApp.disabled">
      <br :key="'br-' + i">
      <v-alert
        :key="'alert-' + i"
        type="error"
        dense
        border="left"
        class="my-2"
      >
        <span>{{ disabled }}</span>
      </v-alert>
    </template>
    <template #activator="{attrs, on}">
      <v-card
        :color="selected ? 'primary' : ''"
        :dark="selected"
        :style="baseApp.disabled.length ? 'cursor:default' : 'cursor:pointer'"
        :elevation="hover && !baseApp.disabled.length ? 2 : 0"
        outlined
        v-bind="attrs"
        @mouseenter="e => {hover = true; on.mouseenter(e)}"
        @mouseleave="e => {hover = false; on.mouseleave(e)}"
        @click="!baseApp.disabled.length && $emit('click')"
      >
        <v-img
          :src="baseApp.image"
          :alt="baseApp.title"
          aspect-ratio="2.5"
        />
        <v-card-title :class="{'error--text': baseApp.disabled.length}">
          <h5>
            <v-icon
              v-if="!baseApp.public"
              :title="$t('restrictedAccess')"
            >
              mdi-security
            </v-icon>&nbsp;{{ baseApp.title }}
          </h5>
        </v-card-title>
      </v-card>
    </template>
  </v-tooltip>
</template>

<i18n lang="yaml">
fr:
  restrictedAccess: Application à accès restreint
en:
  restrictedAccess: Application with restricted access
</i18n>

<script>
export default {
  props: ['baseApp', 'selected'],
  data: () => ({
    hover: false
  })
}
</script>

<style lang="css" scoped>
</style>

<style lang="css" scoped>
.v-tooltip__content.base-app-tooltip {
  background: rgba(97, 97, 97, 1);
  opacity: 1 !important;
  max-width: 600px;
}
</style>
