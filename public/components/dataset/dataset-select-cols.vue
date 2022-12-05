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
        <template v-for="group in groups">
          <v-checkbox
            v-if="group"
            :key="group"
            :label="group"
            :input-value="groupStatus(group) !== 'none'"
            :color="groupStatus(group) === 'some' ? 'grey' : 'primary'"
            dense
            hide-details
            @change="value => toggleGroup(group, value)"
          >
            <template #append>
              <v-btn
                v-if="unfoldedGroups[group]"
                :key="'fold-down-' + group"
                icon
                style="margin-top:-8px;"
                :title="$t('fold')"
                @click="$set(unfoldedGroups, group, false)"
              >
                <v-icon>
                  mdi-menu-down
                </v-icon>
              </v-btn>
              <v-btn
                v-if="!unfoldedGroups[group]"
                :key="'fold-up-' + group"
                icon
                style="margin-top:-8px;"
                :title="$t('unfold')"
                @click="$set(unfoldedGroups, group, true)"
              >
                <v-icon>
                  mdi-menu-left
                </v-icon>
              </v-btn>
            </template>
          </v-checkbox>
          <template v-for="(header) in fieldHeaders.filter(header => (header.field['x-group'] || '') === group)">
            <v-checkbox
              v-show="!header.field['x-group'] || unfoldedGroups[header.field['x-group']]"
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
        </template>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  visibleColumns: Colonnes visibles
  showAll: tout afficher
  fold: plier
  unfold: déplier
en:
  visibleColumns: Visible columnes
  showAll: show all
  fold: fold
  unfold: unfold
</i18n>

<script>
export default {
  props: ['value', 'headers'],
  data () {
    return { unfoldedGroups: {} }
  },
  computed: {
    fieldHeaders () {
      return this.headers.filter(h => !!h.field)
    },
    groups () {
      return this.fieldHeaders.reduce((groups, header) => {
        if (header.field['x-group'] && !groups.includes(header.field['x-group'])) groups.push(header.field['x-group'])
        return groups
      }, []).concat([''])
    },
    groupStatus () {
      return (group) => {
        let nbSelected = 0
        let nbTotal = 0
        for (const header of this.fieldHeaders) {
          if (header.field['x-group'] !== group) continue
          nbTotal += 1
          if (this.value.includes(header.value)) nbSelected += 1
        }
        if (nbTotal === nbSelected) return 'all'
        if (nbSelected) return 'some'
        return 'none'
      }
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
