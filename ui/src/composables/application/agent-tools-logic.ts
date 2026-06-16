// Pure formatting for the get_application_config tool, extracted for unit testing.
export function formatApplicationConfig (config: any): string {
  if (!config || (typeof config === 'object' && Object.keys(config).length === 0)) {
    return 'This application is not configured yet.'
  }
  return '```json\n' + JSON.stringify(config, null, 2) + '\n```'
}
