<template>
  <div>
    <v-form ref="form">
      <lazy-v-jsf
        v-model="wrapper"
        :schema="wrapperSchema"
        :options="{locale: 'fr'}"
        @change="change"
      />
    </v-form>
  </div>
</template>

<script>
import eventBus from '~/event-bus'

const infoSchema = require('~/../contract/settings').properties.info
const wrapperSchema = {
  type: 'object',
  properties: {
    info: infoSchema
  }
}

export default {
  props: ['settings'],
  data: () => ({
    eventBus,
    wrapperSchema,
    formValid: true,
    wrapper: {
      info: {}
    }
  }),
  created () {
    this.wrapper.info = JSON.parse(JSON.stringify(this.settings.info || {}))
  },
  methods: {
    async change () {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.$refs.form.validate()) {
        this.settings.info = JSON.parse(JSON.stringify(this.wrapper.info))
        this.$emit('updated')
      }
    }
  }
}
</script>
