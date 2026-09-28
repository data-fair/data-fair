/**
 * How the application creation wizard works, told to the assistant once on arrival.
 *
 * It used to reach the model only as the hidden context of the
 * "help-create-application" action button — where the dataset wizard's guidance
 * was until a judged run showed that every assistant arrives by navigating
 * itself, and none had ever received it. Published as keyed state so it is
 * delivered on arrival, or on activation if the chat opens later, and never
 * repeated.
 *
 * One line, under EVENT_DETAIL_MAX_CHARS: a string detail is placed verbatim in a
 * line-oriented block and truncated past the cap.
 *
 * The key is shared with the dataset wizard on purpose: only one of the two pages
 * is ever mounted, and the chat keeps one value per key, so a stale guidance
 * cannot outlive the wizard that published it.
 */
export const APPLICATION_WIZARD_GUIDANCE_KEY = 'wizard-guidance'

export const APPLICATION_WIZARD_GUIDANCE =
  'Application creation wizard. Ask what the person wants to see, then find a model with list_base_applications ' +
  '(or an application to copy with list_applications), present the options and let them choose. ' +
  'Fill the wizard with select_creation_type, then select_base_application or select_copy_application, then set_application_title. ' +
  'Those tools advance the steps themselves. The person presses the final save button themselves: once the wizard state reports ready, ' +
  'tell them it is ready and declare wait_for_user_action, so you learn of the creation without being asked. ' +
  'When the page query carries a dataset id, the application is being built on that dataset — use it rather than asking which data to show. ' +
  'After saving, the application opens on its configuration form, which has its own assistant. Do not send them looking for anything.'
