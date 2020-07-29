export default function ({ store }) {
  console.log('clear breadcrumbs')
  // reinit breadcrumbs after each page change
  // pages can fill it again
  store.dispatch('breadcrumbs', null)
}
