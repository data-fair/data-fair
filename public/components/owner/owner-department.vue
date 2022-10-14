<template>
  <v-tooltip
    v-if="owner && owner.department"
    top
  >
    <template #activator="{on}">
      <span
        class="text-body-2"
        v-on="on"
      >
        <v-avatar :size="28">
          <img :src="`${env.directoryUrl}/api/avatars/${owner.type}/${owner.id}/${owner.department}/avatar.png`">
        </v-avatar>
      </span>
    </template>
    {{ label }}
  </v-tooltip>
  <!--<span v-if="dataset.owner.type === 'user'"><v-icon>mdi-account</v-icon>&nbsp;{{ dataset.owner.name }}</span>
  <span v-if="dataset.owner.type === 'organization'"><v-icon>mdi-account-group</v-icon>&nbsp;{{ dataset.owner.name }}<span v-if="dataset.owner.role"> ({{ dataset.owner.role }})</span></span>-->
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: ['owner'],
  computed: {
    ...mapState(['env']),
    label () {
      return this.owner.departmentName || this.owner.department
    }
  }
}
</script>

<style lang="css" scoped>
</style>
