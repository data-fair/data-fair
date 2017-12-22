<template>
<span v-if="user">
  {{user.firstName ? user.firstName + ' '+ user.lastName : user.email.split('@').shift().split('.').map(str => str[0].toUpperCase() + str.slice(1)).join(' ')}}
</span>
</template>

<script>
export default {
  name: 'user-name',
  props: ['user']
}
</script>
