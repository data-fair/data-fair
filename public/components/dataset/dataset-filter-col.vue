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
        icon
        :outlined="active"
        v-bind="attrs"
        class="pa-0"
        color="primary"
        :input-value="active"
        v-on="on"
      >
        <v-icon>mdi-filter-variant</v-icon>
      </v-btn>
    </template>
    <v-sheet class="pa-1">
      <v-combobox
        v-if="showEquals"
        v-model="equals"
        chips
        multiple
        label="égal"
        outlined
        hide-details
        dense
        deletable-chips
        class="mt-1"
        :type="field.type === 'number' || field.type === 'integer' ? 'number' : 'text'"
        @change="emitFilter({ type: 'in', values: equals })"
        @keyup.enter="emitFilter({ type: 'in', values: equals })"
      >
        <template #append-outer>
          <v-btn
            icon
            class="mr-1"
            :disabled="!equals"
            color="primary"
            :title="$t('applyFilter')"
            @click="emitFilter({ type: 'in', values: equals })"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-combobox>

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

      <v-text-field
        v-if="showSearch"
        v-model="search"
        label="contient des mots"
        outlined
        hide-details
        dense
        class="mt-1"
        @keyup.enter="search && emitFilter({value: search, type: 'search', nested: showSearch})"
      >
        <template #append-outer>
          <v-btn
            icon
            class="mr-1"
            :disabled="!search"
            color="primary"
            :title="$t('applyFilter')"
            @click="emitFilter({value: search, type: 'search', nested: showSearch})"
          >
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
      </v-text-field>

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

      <!-- enum -->
      <v-list
        v-if="showEnum"
        dense
        class="py-0"
      >
        <v-list-item
          v-for="value in field.enum.slice().sort()"
          :key="value"
          :input-value="equals.includes(value)"
          style="min-height:32px;"
          class="px-2"
          @click="toggleEquals(value)"
        >
          <v-list-item-icon class="my-1 mr-3">
            <v-icon
              v-if="equals.includes(value)"
              color="primary"
            >
              mdi-checkbox-marked
            </v-icon>
            <v-icon v-else>
              mdi-checkbox-blank-outline
            </v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>
              {{ value | cellValues(field) }}
            </v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
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
      equals: [],
      startsWith: '',
      search: '',
      equalsBool: null,
      lte: null,
      gte: null,
      editDate: null
    }
  },
  computed: {
    showEnum () {
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      return this.field.enum && this.field['x-cardinality'] > 1
    },
    showEquals () {
      if (this.showEnum) return false
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      if (this.field['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
      if (this.field.type === 'string' && (!this.field.format || this.field.format === 'uri-reference')) return true
      if (this.field.type === 'number' || this.field.type === 'integer') return true
      return false
    },
    showBoolEquals () {
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      return !this.showEnum && this.field.type === 'boolean'
    },
    showStartsWith () {
      return this.field.type === 'string' && this.showEquals
    },
    showNumCompare () {
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      return this.field.type === 'integer' || this.field.type === 'number'
    },
    showDateCompare () {
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      return this.field.type === 'string' && (this.field.format === 'date' || this.field.format === 'date-time')
    },
    showSearch () {
      if (this.showEnum) return ''
      if (this.field.type !== 'string') return ''
      if (this.field.format && this.field.format !== 'uri-reference') return ''
      if (!this.field['x-capabilities'] || this.field['x-capabilities'].text !== false) return 'text'
      if (!this.field['x-capabilities'] || this.field['x-capabilities'].textStandard !== false) return 'text_standard'
      return ''
    },
    active () {
      return !!this.filters.find(f => f.field.key === this.field.key)
    }
  },
  methods: {
    toggledMenu () {
      this.emptyFilters()
      const filters = this.filters.filter(f => f.field.key === this.field.key)
      for (const filter of filters) {
        if ('minValue' in filter && filter.minValue !== '*') this.gte = filter.minValue
        if ('maxValue' in filter && filter.maxValue !== '*') this.lte = filter.maxValue
        if (filter.type === 'starts') this.startsWith = filter.value
        if (filter.type === 'search') this.search = filter.value
        if (filter.type === 'in' && filter.values && filter.values.length) {
          if (this.field.type === 'string' || this.field.type === 'number' || this.field.type === 'integer') {
            this.equals = [...filter.values]
          }
          if (this.field.type === 'boolean') this.equalsBool = filter.values[0]
        }
      }
    },
    toggleEquals (value) {
      if (this.equals.includes(value)) this.equals = this.equals.filter(v => v !== value)
      else this.equals.push(value)
      this.emitFilter({ type: 'in', values: this.equals })
    },
    emitIntervalFilter () {
      if (!this.gte && !this.lte) return
      this.emitFilter({
        type: 'interval',
        minValue: this.gte,
        maxValue: this.lte
      })
    },
    emitFilter (filter, close = true) {
      this.$emit('filter', filter)
      this.showMenu = false
      this.emptyFilters()
    },
    emptyFilters () {
      this.equals = []
      this.startsWith = ''
      this.search = ''
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
