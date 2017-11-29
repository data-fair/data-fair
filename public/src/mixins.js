module.exports.routerMixin = {
  methods: {
    urlFromRoute: function(route) {
      const a = document.createElement('a')
      a.href = this.$router.resolve(route).href
      return a.protocol + '//' + a.host + a.pathname + a.search + a.hash
    }
  }
}
