<template>
  <v-menu
    offset-y
    tile
    :close-on-content-click="false"
    max-height="500"
  >
    <template #activator="{ on }">
      <v-btn
        icon
        large
        :color="value.length ? 'warning' : 'default'"
        v-on="on"
      >
        <v-icon>mdi-table-eye</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-subheader v-t="'visibleColumns'" />
      <v-card-text class="pt-0">
        <v-btn
          v-t="'showAll'"
          text
          :disabled="!value.length"
          @click="$emit('input', [])"
        />
        <template v-for="(header, i) in fieldHeaders">
          <v-checkbox
            v-if="header.field['x-group'] && header.field['x-group'] !== (fieldHeaders[i - 1] && fieldHeaders[i - 1].field && fieldHeaders[i - 1].field['x-group'])"
            :key="'group-' + header.value"
            :label="header.field['x-group']"
            dense
            hide-details
            @change="value => toggleGroup(header.field['x-group'], value)"
          />
          <v-checkbox
            :key="header.value"
            :value="header.value"
            :label="header.text"
            :input-value="value"
            dense
            hide-details
            :class="{'ml-3': !!header.field['x-group']}"
            @change="newValue => $emit('input', newValue)"
          />
        </template>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  visibleColumns: Colonnes visibles
  showAll: tout afficher
en:
  visibleColumns: Visible columnes
  showAll: show all
</i18n>

<script>
export default {
  props: ['value', 'headers'],
  computed: {
    fieldHeaders () {
      return this.headers.filter(h => !!h.field)
    }
  },
  methods: {
    toggleGroup (group, value) {
      if (value) {
        const newValue = [...this.value]
        for (const header of this.fieldHeaders) {
          if (header.field['x-group'] === group && !this.value.includes(header.value)) {
            newValue.push(header.value)
          }
        }
        this.$emit('input', newValue)
      } else {
        const newValue = this.value.filter(v => {
          const header = this.fieldHeaders.find(fh => fh.value === v)
          return header.field['x-group'] !== group
        })
        this.$emit('input', newValue)
      }
    }
  }
}
</script>

<style lang="css" scoped>
</style>
