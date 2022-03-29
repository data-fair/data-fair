<template>
  <v-menu
    v-if="showEnum || showEquals || showStartsWith || showBoolEquals || showNumCompare || showDateCompare"
    v-model="showMenu"
    bottom
    left
    offset-y
    :max-height="filterHeight"
    :close-on-content-click="false"
    @input="toggledMenu"
  >
    <template #activator="{on, attrs}">
      <v-btn
        small
        depressed
        text
        v-bind="attrs"
        class="pa-0"
        color="primary"
        style="min-width:40px;"
        v-on="on"
      >
        <v-icon>mdi-filter-variant</v-icon>
      </v-btn>
    </template>
    <v-sheet class="pa-1">
      <v-text-field
        v-if="showEquals"
        v-model="equals"
        label="égal"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="equals && emitFilter(equals)"
      >
        <template #append-outer>
          <v-btn
            icon
            class="mr-1"
            :disabled="!equals"
            color="primary"
            :title="$t('applyFilter')"
            @click="emitFilter(equals)"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>
      <v-text-field
        v-if="showStartsWith"
        v-model="startsWith"
        label="commence par"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="startsWith && emitFilter({value: startsWith, type: 'starts'})"
      >
        <template #append-outer>
          <v-btn
            icon
            class="mr-1"
            :disabled="!startsWith"
            color="primary"
            :title="$t('applyFilter')"
            @click="emitFilter({value: startsWith, type: 'starts'})"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>
      <v-list
        v-if="showEnum"
        dense
        class="py-0"
      >
        <v-list-item
          v-for="value in field.enum.slice().sort()"
          :key="value"
          :input-value="equals === value"
          @click="emitFilter(value)"
        >
          {{ value | cellValues(field) }}
        </v-list-item>
      </v-list>
      <v-list
        v-if="showBoolEquals"
        dense
        class="py-0"
      >
        <v-list-item
          :input-value="equalsBool === true"
          @click="emitFilter(true)"
        >
          {{ true | cellValues(field) }}
        </v-list-item>
        <v-list-item
          :input-value="equalsBool === false"
          @click="emitFilter(false)"
        >
          {{ false | cellValues(field) }}
        </v-list-item>
      </v-list>
      <!-- num interval -->
      <v-text-field
        v-if="showNumCompare"
        v-model="gte"
        label="supérieur ou égal à"
        outlined
        hide-details
        dense
        class="mt-1"
        type="number"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append-outer>
          <div style="width:36px;height:36px;" />
        </template>
      </v-text-field>
      <v-text-field
        v-if="showNumCompare"
        v-model="lte"
        label="inférieur ou égal à"
        outlined
        hide-details
        dense
        class="mt-1"
        type="number"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append-outer>
          <v-btn
            icon
            :disabled="!lte && !gte"
            color="primary"
            :title="$t('applyFilter')"
            @click="emitIntervalFilter"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <!-- date interval -->
      <v-text-field
        v-if="showDateCompare"
        :value="gte && $root.$options.filters.cellValues(gte, field)"
        label="supérieur ou égal à"
        outlined
        hide-details
        dense
        class="mt-1"
        readonly
        clearable
        @click:clear="gte = null"
        @focus="editDate = 'gte'"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append-outer>
          <div style="width:36px;height:36px;" />
        </template>
      </v-text-field>
      <v-text-field
        v-if="showDateCompare"
        :value="lte && $root.$options.filters.cellValues(lte, field)"
        label="inférieur ou égal à"
        outlined
        hide-details
        dense
        class="mt-1"
        readonly
        clearable
        @click:clear="lte = null"
        @focus="editDate = 'lte'"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append-outer>
          <v-btn
            icon
            :disabled="!lte && !gte"
            color="primary"
            :title="$t('applyFilter')"
            @click="emitIntervalFilter"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>
      <v-date-picker
        v-if="editDate === 'gte'"
        v-model="gte"
        no-title
      />
      <v-date-picker
        v-if="editDate === 'lte'"
        v-model="lte"
        no-title
      />
    </v-sheet>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  applyFilter: Appliquer le filtre
en:
  applyFilter: Apply filter
</i18n>

<script>
export default {
  props: ['field', 'filterHeight', 'filters'],
  data () {
    return {
      showMenu: false,
      equals: '',
      startsWith: '',
      equalsBool: null,
      lte: null,
      gte: null,
      editDate: null
    }
  },
  computed: {
    showEnum () {
      return this.field.enum && this.field['x-cardinality'] > 1
    },
    showEquals () {
      return !this.showEnum && this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')
    },
    showBoolEquals () {
      return !this.showEnum && this.field.type === 'boolean'
    },
    showStartsWith () {
      return this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')
    },
    showNumCompare () {
      return this.field.type === 'integer' || this.field.type === 'number'
    },
    showDateCompare () {
      return this.field.type === 'string' && (this.field.format === 'date' || this.field.format === 'date-time')
    }
  },
  methods: {
    toggledMenu () {
      const filters = this.filters.filter(f => f.field.key === this.field.key)
      for (const filter of filters) {
        console.log(filter)
        if ('minValue' in filter && filter.minValue !== '*') this.gte = filter.minValue
        if ('maxValue' in filter && filter.maxValue !== '*') this.lte = filter.maxValue
        if (filter.type === 'starts') this.startsWith = filter.value
        if (filter.type === 'in' && filter.values && filter.values.length === 1) {
          if (this.field.type === 'string') this.equals = filter.values[0]
          if (this.field.type === 'boolean') this.equalsBool = filter.values[0]
        }
      }
      console.log(this.showMenu, this.filters)
    },
    emitIntervalFilter () {
      if (!this.gte && !this.lte) return
      this.emitFilter({
        type: 'interval',
        minValue: this.gte || '*',
        maxValue: this.lte || '*'
      })
    },
    emitFilter (filter) {
      this.$emit('filter', filter)
      this.showMenu = false
      this.equals = ''
      this.startsWith = ''
      this.equalsBool = null
      this.lte = null
      this.gte = null
      this.editDate = null
    }
  }
}
</script>

<style>

</style>
