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
            v-if="isFirstInGroup(i)"
            :key="'group-' + header.value"
            :label="header.field['x-group']"
            dense
            hide-details
            @change="value => toggleGroup(header.field['x-group'], value)"
          >
            <template #append>
              <v-btn
                v-if="isFirstInGroup(i) && !foldedGroups[header.field['x-group']]"
                :key="'fold-down-' + header.value"
                icon
                style="margin-top:-8px;"
                @click="$set(foldedGroups, header.field['x-group'], true)"
              >
                <v-icon>
                  mdi-menu-down
                </v-icon>
              </v-btn>
              <v-btn
                v-if="isFirstInGroup(i) && foldedGroups[header.field['x-group']]"
                :key="'fold-down-' + header.value"
                icon
                style="margin-top:-8px;"
                @click="$set(foldedGroups, header.field['x-group'], false)"
              >
                <v-icon>
                  mdi-menu-left
                </v-icon>
              </v-btn>
            </template>
          </v-checkbox>

          <v-checkbox
            v-show="!foldedGroups[header.field['x-group']]"
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
  data () {
    return { foldedGroups: {} }
  },
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
    },
    isFirstInGroup (i) {
      const previousGroup = this.fieldHeaders[i - 1] && this.fieldHeaders[i - 1].field && this.fieldHeaders[i - 1].field['x-group']
      return this.fieldHeaders[i].field['x-group'] && this.fieldHeaders[i].field['x-group'] !== previousGroup
    }
  }
}
</script>

<style lang="css" scoped>
</style>
