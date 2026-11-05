# Dashboard

The home page of the back-office (`ui/src/pages/index.vue`, `ui/src/components/dashboard/`).

## Composition across services

- **Reads of other services.** The "to do" list calls a few public endpoints directly from the browser, when the
  service is present in the stack. These are a contract: changing one needs a release coordinated with data-fair.

  | Service | Endpoint | Field read |
  |---|---|---|
  | processings | `GET /processings/api/v1/processings?size=0` | `facets.statuses.error` |
  | portals | `GET /portals-manager/api/reuses?size=0` | `facets.requestedPortals` |
  | portals | `GET /portals-manager/api/pages?size=0` | `facets.requestedPortals` |

  A failed read hides its line, without a toast, and the card reports that some checks did not complete.

- **Rich blocks.** A block with its own UI is an iframe of the service, not a shared component. The recent activity
  frames `/events/embed/events-compact`; the card around it (title, link to the traceability) stays in data-fair.

- **`extraTodoItems`.** The config option is only for what sits outside of the data-fair stack (customers, or the
  equivalent in an on-premise install). A service of the stack is integrated as above, like the navigation does
  from `processingsIntegration`, `portalsIntegration` and `eventsIntegration`.

## Deployment order

The `*Integration` flags tell that a service is present, not its version: deploy events before a data-fair that
frames `/events/embed/events-compact`.
