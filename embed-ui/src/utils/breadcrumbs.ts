export const setBreadcrumbs = (breadcrumbs: { text: string; to?: string }[]) => {
  if (window.parent) parent.postMessage({ breadcrumbs }, '*')
  else console.log('Breadcrumbs:', breadcrumbs)
}
export default setBreadcrumbs
