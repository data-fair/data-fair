<template>
  <v-list-item>
    <v-list-item-avatar class="ml-0 my-0">
      <v-avatar :size="28">
        <img
          v-if="owner.department"
          :src="`${env.directoryUrl}/api/avatars/${owner.type}/${owner.id}/${owner.department}/avatar.png`"
        >
        <img
          v-else
          :src="`${env.directoryUrl}/api/avatars/${owner.type}/${owner.id}/avatar.png`"
        >
      </v-avatar>
    </v-list-item-avatar>
    <span>{{ label }}</span>
  </v-list-item>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: ['owner'],
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
