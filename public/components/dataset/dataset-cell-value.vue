<template>
  <span>{{ formattedValue }}</span>
</template>

<script>
  export default {
    props: ['value', 'property'],
    computed: {
      formattedValue() {
        if (this.value === undefined || this.value === null) return ''
        if (this.property.format === 'date-time') return this.$root.$options.filters.moment(this.value, 'DD/MM/YYYY, HH:mm')
        if (this.property.format === 'date') return this.$root.$options.filters.moment(this.value, 'DD/MM/YYYY')
        if (this.property.type === 'boolean') {
          if (typeof this.value === 'string') return this.value === 'true' ? 'oui' : 'non'
          return this.value ? 'oui' : 'non'
        }
        return this.$root.$options.filters.truncate(this.value + '', 50)
      },
    },
  }
</script>

<style>

</style>
