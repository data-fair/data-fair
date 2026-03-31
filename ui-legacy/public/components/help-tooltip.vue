<template>
  <v-tooltip
    class="help-tooltip"
    :left="orientation === 'left'"
    :bottom="orientation === 'bottom'"
  >
    <template #activator="{attrs, on}">
      <v-btn
        icon
        v-bind="attrs"
        :small="small"
        v-on="on"
      >
        <v-icon :small="small">
          mdi-information
        </v-icon>
      </v-btn>
    </template>
    <div
      class="help-tooltip-content"
      style="max-width: 400px;"
    >
      <slot />
    </div>
  </v-tooltip>
</template>

<script>
export default {
  props: {
    small: { type: Boolean, default: false },
    orientation: { type: String, default: 'left' }
  }
}
</script>

<style>
.help-tooltip-content p:last-child {
  margin-bottom: 0;
}

.v-input--dense .v-input__append-outer {
  margin-top: 2px !important;
}

.v-input__append-outer {
  height: 24px;
}
</style>
