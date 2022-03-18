<template>
  <v-tooltip
    class="help-tooltip"
    :left="true"
  >
    <template #activator="{attrs, on}">
      <v-btn
        icon
        v-bind="attrs"
        v-on="on"
      >
        <v-icon>
          mdi-information
        </v-icon>
      </v-btn>
    </template>
    <div style="max-width: 400px;">
      <slot />
    </div>
  </v-tooltip>
</template>

<script>
export default {}
</script>

<style>
.help-tooltip p:last-child {
  margin-bottom: 0;
}

.v-input--dense .v-input__append-outer {
  margin-top: 2px !important;
}
</style>
