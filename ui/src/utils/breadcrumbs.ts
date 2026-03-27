export const setBreadcrumbs = (breadcrumbs: { text: string; to?: string }[]) => {
  parent.postMessage('hello', '*')
  if (window.parent) parent.postMessage({ breadcrumbs }, '*')
}
export default setBreadcrumbs
