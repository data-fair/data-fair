/**
 * How the dataset creation wizard works, told to the assistant once on arrival.
 *
 * It used to reach the model only as the hidden context of the
 * "help-create-dataset" action button, so an assistant that navigated to the
 * wizard itself — every judged run — drove it on tool descriptions alone: it
 * never declared wait_for_user_action before handing over Create (the person had
 * to type "j'ai cliqué… qu'est-ce que ça donne ?"), and it invented a column
 * step the wizard does not have. Published as keyed state so it is delivered on
 * arrival, or on activation if the chat opens later, and never repeated.
 *
 * One line, under EVENT_DETAIL_MAX_CHARS: a string detail is placed verbatim in a
 * line-oriented block and truncated past the cap.
 */
export const DATASET_WIZARD_GUIDANCE_KEY = 'wizard-guidance'

export const DATASET_WIZARD_GUIDANCE =
  'Dataset creation wizard. Ask what data they have; recommend the type ' +
  '(file: an uploaded file — the person uploads it; rest/Editable: entered by hand or via API; ' +
  'virtual: a view over existing datasets; metaOnly: metadata only). ' +
  'Fill the wizard with select_dataset_type, set_dataset_title, set_rest_options, skip_init_from_step, advance_to_confirmation. ' +
  'The person presses Create themselves: once the confirmation step reports ready, tell them the button is ready and declare wait_for_user_action, so you learn of the creation without being asked. ' +
  'After creation an editable dataset has no columns yet: on the dataset page, agree the columns with the person and declare them with add_columns. The structure state then reports ready: tell them to click Enregistrer and declare wait_for_user_action. Do not send them looking for a tab or ask them to check the columns themselves.'
