<template>
  <v-card
    :loading="value === null"
    outlined
    tile
    v-bind="cardProps"
  >
    <div class="text-center mt-4 mb-2">
      <v-col class="py-0">
        <span
          class="headline font-weight-bold"
          style="height:40px;display:block;"
        >
          <v-skeleton-loader
            v-if="value === null"
            max-width="80"
            type="button"
            class="mx-auto"
          />
          <template v-else>
            {{ value }}
          </template>

        </span>
        <span
          :class="{title: true, 'font-weight-bold': !!value}"
          style="min-height:40px;display:block;"
        >
          {{ title }}
        </span>
      </v-col>
    </div>
  </v-card>
</template>

<script>

export default {
  props: {
    title: { type: String, required: true },
    value: { type: Number, default: null },
    to: { type: Object, default: null },
    color: { type: String, default: 'primary' }
  },
  computed: {
    cardProps () {
      if (!this.value) return {}
      const props = {
        hover: true,
        dark: true,
        color: this.color,
        class: `white--text ${this.color}-gradient`
      }
      if (this.to) props.to = this.to
      return props
    }
  }
}
</script>

<style lang="css" scoped>
</style>
