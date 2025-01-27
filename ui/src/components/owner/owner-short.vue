<template>
  <v-tooltip top>
    <template #activator="{on}">
      <span
        class="text-body-2"
        v-on="on"
      >
        <v-avatar :size="28">
          <img
            v-if="owner.department && !ignoreDepartment"
            :src="`${env.directoryUrl}/api/avatars/${owner.type}/${owner.id}/${owner.department}/avatar.png`"
          >
          <img
            v-else
            :src="`${env.directoryUrl}/api/avatars/${owner.type}/${owner.id}/avatar.png`"
          >
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
  props: ['owner', 'ignoreDepartment'],
  computed: {
    ...mapState(['env']),
    label () {
      let label = this.owner.name
      if (this.owner.department && !this.ignoreDepartment) label += ' - ' + (this.owner.departmentName || this.owner.department)
      if (this.owner.role) label += ` (${this.owner.role})`
      return label
    }
  }
}
</script>

<style lang="css" scoped>
</style>
