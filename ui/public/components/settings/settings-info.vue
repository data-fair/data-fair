<template>
  <div style="min-height:60px;">
    <v-form ref="form">
      <lazy-v-jsf
        v-model="localValue"
        :schema="infoSchema"
        :options="{locale: 'fr', textFieldProps: {outlined:true, dense: true}}"
        @change="change"
      />
    </v-form>
  </div>
</template>

<script>
import settingsSchema from '~/../../api/types/settings/schema.js'

const infoSchema = settingsSchema.properties.info

export default {
  props: ['value'],
  data: () => ({
    infoSchema,
    formValid: true,
    localValue: {}
  }),
  created () {
    this.localValue = JSON.parse(JSON.stringify(this.value || {}))
  },
  methods: {
    async change () {
      await new Promise(resolve => setTimeout(resolve, 10))
      if (this.$refs.form.validate()) {
        this.$emit('input', this.localValue)
      }
    }
  }
}
</script>
