<template>
  <span v-if="user">
    {{ userName }}
  </span>
</template>

<script>
export default {
  name: 'UserName',
  props: ['user'],
  computed: {
    userName() {
      if (!this.user) return 'Anonyme'
      if (this.user.name) return this.user.name
      if (this.user.firstName || this.user.lastName) return ((this.user.firstName || '') + ' ' + (this.user.lastName || '')).trim()
      if (this.user.email) return this.user.email.split('@').shift().split('.').map(str => str[0].toUpperCase() + str.slice(1)).join(' ')
      return 'Nom d\'utilisateur inconnu'
    }
  }
}
</script>
