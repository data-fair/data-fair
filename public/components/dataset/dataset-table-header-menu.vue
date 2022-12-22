<template>
  <v-menu
    v-model="showMenu"
    bottom
    right
    offset-y
    tile
    :activator="activator"
    :max-height="filterHeight"
    :max-width="450"
    :close-on-content-click="false"
    @input="toggledMenu"
  >
    <v-sheet
      class="pa-1"
      tile
    >
      <v-list
        dense
        class="pa-0"
      >
        <!-- hide column -->
        <v-list-item
          v-if="header.value !== fixedCol"
          class="pl-2"
          @click="$emit('hide');showMenu=false"
        >
          <v-list-item-icon class="mr-2"><v-icon>mdi-eye-off-outline</v-icon></v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>{{ $t('hide') }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <!-- fix column to the left -->
        <v-list-item-group
          v-if="!noFix"
          color="primary"
        >
          <v-list-item
            class="pl-2"
            :class="{'v-item--active v-list-item--active': header.value === fixedCol}"
            @click="$emit('fixCol');showMenu=false"
          >
            <v-list-item-icon class="mr-2"><v-icon>mdi-format-horizontal-align-left</v-icon></v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>{{ $t('fixLeft') }}</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list-item-group>

        <!-- sorting -->
        <template v-if="header.sortable">
          <v-list-item-group color="primary">
            <v-list-item
              class="pl-2"
              :class="{'v-item--active v-list-item--active': header.value === pagination.sortBy[0] && !pagination.sortDesc[0]}"
              @click="$set(pagination, 'sortBy', [header.value]);$set(pagination, 'sortDesc', [false]);showMenu=false"
            >
              <v-list-item-icon class="mr-2"><v-icon>mdi-sort-ascending</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>{{ $t('sortAsc') }}</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
            <v-list-item
              class="pl-2"
              :class="{'v-item--active v-list-item--active': header.value === pagination.sortBy[0] && pagination.sortDesc[0]}"
              @click="$set(pagination, 'sortBy', [header.value]);$set(pagination, 'sortDesc', [true]);showMenu=false"
            >
              <v-list-item-icon class="mr-2"><v-icon>mdi-sort-descending</v-icon></v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>{{ $t('sortDesc') }}</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
          </v-list-item-group>
        </template>

        <!-- show help -->
        <v-list-item-group color="primary">
          <v-list-item
            v-if="!!header.tooltip"
            class="pl-2"
            :class="{'v-item--active v-list-item--active': showHelp}"
            @click="showHelp = !showHelp"
          >
            <v-list-item-icon class="mr-2"><v-icon>mdi-information</v-icon></v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>{{ $t('showHelp') }}</v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list-item-group>
        <v-alert
          v-if="showHelp"
          color="info"
          text
          tile
          style="overflow-wrap: break-word"
          class="mt-0 mb-2 pa-2"
          v-html="header.tooltip"
        />
      </v-list>

      <v-subheader
        v-if="showEnum || showEquals || showStartsWith || showBoolEquals || showNumCompare || showDateCompare"
        dense
        style="height:22px"
        class="pl-2"
      >
        {{ $t('filter') }}
      </v-subheader>
      <template v-if="showEquals">
        <v-text-field
          v-for="i in equals.length"
          :key="i"
          v-model="equals[i - 1]"
          :label="i === 1 ? 'égal' : 'ou égal'"
          outlined
          hide-details
          dense
          class="mt-1"
          clearable
          @keyup.enter="emitFilter({ type: 'in', values: equals.filter(v => !!v) })"
          @click:clear="equals[i - 1] = ''; emitFilter({ type: 'in', values: equals.filter(v => !!v) }, false)"
          @change="emitFilter({ type: 'in', values: equals.filter(v => !!v) }, false)"
        >
          <template #append-outer>
            <v-btn
              v-if="i === equals.length - 1"
              icon
              class="mr-1"
              :disabled="equals.length <= 1"
              color="primary"
              :title="$t('applyFilter')"
              @click="emitFilter({ type: 'in', values: equals.filter(v => !!v) })"
            >
              <v-icon>mdi-check</v-icon>
            </v-btn>
            <div
              v-else
              style="width:40px;height:36px;"
            />
          </template>
        </v-text-field>
      </template>
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
          v-for="{value, important} in fullEnum"
          :key="value"
          :input-value="equals.includes(value)"
          :style="{'minHeight': enumDense ? '24px' : '32px'}"
          class="px-2"
          @click="toggleEquals(value)"
        >
          <v-list-item-icon :class="{'my-0': enumDense, 'my-1': !enumDense, 'mr-0': enumDense, 'mr-2': !enumDense}">
            <v-icon
              v-if="equals.includes(value)"
              color="primary"
              :small="enumDense"
            >
              mdi-checkbox-marked
            </v-icon>
            <v-icon
              v-else
              :small="enumDense"
            >
              mdi-checkbox-blank-outline
            </v-icon>
          </v-list-item-icon>
          <v-list-item-content :class="{'pt-1': enumDense, 'pb-0': enumDense, 'pt-2': !enumDense, 'pb-2': !enumDense}">
            <v-list-item-title :class="{'font-weight-bold': important}">
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
  hide: Masquer cette colonne
  sortAsc: Tri ascendant
  sortDesc: Tri descendant
  filter: "Filtrer :"
  applyFilter: Appliquer le filtre
  info: "Informations :"
  fixLeft: "Fixer la colonne à gauche"
  showHelp: "Afficher la description"
en:
  hide: Hide this column
  sortAsc: Ascending sort
  sortDesc: Descending sort
  filter: "Filter:"
  applyFilter: Apply filter
  info: "Information:"
  fixLeft: "Fix the column to the left"
  showHelp: "Show description"
</i18n>

<script>

export default {
  props: {
    header: { type: Object, required: true },
    filters: { type: Array, required: true },
    filterHeight: { type: Number, required: true },
    pagination: { type: Object, required: true },
    fixedCol: { type: String, default: null },
    activator: { type: String, required: true },
    noFix: { type: Boolean, default: false },
    localEnum: { type: Array, required: false, default: null },
    closeOnFilter: { type: Boolean, default: false }
  },
  data () {
    return {
      showMenu: false,
      equals: [],
      startsWith: '',
      search: '',
      equalsBool: null,
      lte: null,
      gte: null,
      editDate: null,
      showHelp: false
    }
  },
  computed: {
    field () {
      return this.header.field
    },
    fullEnum () {
      if (!this.showEnum) return
      const fullEnum = []
      if (this.localEnum) {
        for (const value of this.localEnum) {
          fullEnum.push({ value, important: true })
        }
      }
      if (this.field.enum) {
        for (const value of this.field.enum.slice().sort()) {
          if (!this.localEnum || !this.localEnum.includes(value)) fullEnum.push({ value })
        }
      }
      return fullEnum
    },
    showEnum () {
      if (this.field['x-capabilities'] && this.field['x-capabilities'].index === false) return false
      if (this.localEnum) return true
      return this.field.enum && this.field['x-cardinality'] > 1
    },
    enumDense () {
      return this.showEnum && this.fullEnum.length > 4
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
  watch: {
    equals: {
      handler () {
        if (!this.showEquals) return
        const equals = this.equals.filter(v => !!v).concat([''])
        if (JSON.stringify(equals) !== JSON.stringify(this.equals)) this.equals = equals
      },
      deep: true,
      immediate: true
    }
  },
  methods: {
    toggledMenu () {
      if (!this.showMenu) return
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
      this.emitFilter({ type: 'in', values: this.equals }, false)
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
      if (close) {
        this.showMenu = false
      }
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
