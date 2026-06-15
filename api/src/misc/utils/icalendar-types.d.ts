declare module '@koumoul/icalendar' {
  interface ICalProperty {
    value: any
  }
  interface ICalComponent {
    properties: Record<string, ICalProperty[]>
    components: Record<string, ICalComponent[]>
    events: () => ICalComponent[]
  }
  const icalendar: {
    parse_calendar: (content: string) => ICalComponent
  }
  export default icalendar
}
