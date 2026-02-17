export const setBreadcrumbs = (breadcrumbs: { text: string; to?: string }[]) => {
  console.log('setBreadcrumbs', !!window.parent)
  parent.postMessage('hello', '*')
  if (window.parent) parent.postMessage({ breadcrumbs }, '*')
  else console.log('Breadcrumbs:', breadcrumbs)
}
export default setBreadcrumbs
