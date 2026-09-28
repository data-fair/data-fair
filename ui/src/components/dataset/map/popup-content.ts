// Pure rendering of the feature popup shown when clicking a geometry on a dataset map.
//
// Extracted from use-map.ts so it can be unit tested, because it is a security boundary:
// maplibre's `Popup.setHTML` does NOT sanitize its input. Its `DOM.sanitize()` helper has a
// single caller, the AttributionControl — `setHTML` merely does `body.innerHTML = html` and
// moves the resulting nodes into the live popup container. Labels (column titles) and values
// (cell contents) are both authored by whoever owns the dataset, so escaping here is the only
// thing preventing HTML injection into every viewer of a public dataset's map.

/** Escape a value for interpolation into HTML text content or a double-quoted attribute. */
export const escapeHtml = (value: unknown): string => ('' + value)
  // the ampersand must be replaced first, otherwise it would re-escape the escapes below
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export type PopupItem = { label: string, value: unknown }

/** Build the popup markup for a feature, one list item per displayed field. */
export const buildPopupHtml = (items: PopupItem[]): string => {
  const htmlList = items
    .map(({ label, value }) => `<li style="list-style-type: none;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join('\n')
  return `<ul style="padding-left: 0;">${htmlList}</ul>`
}
