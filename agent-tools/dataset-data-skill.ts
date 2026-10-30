import { filtersGuide } from './_utils.js'

// A page skill (useAgentSkill in @data-fair/lib-vue-agents): listed to the assistant by its
// description, loaded on demand, followed with the data tools the page registers.

export const name = 'query-dataset-data'

export const description = 'How to query a dataset\'s rows, aggregations and column values (get_dataset_schema, search_data, aggregate_data, calculate_metric, get_field_values), write their filters, and link to a filtered table or map. Load it before querying a dataset\'s data.'

export const body = `Explore and answer questions about a dataset's content with its query tools.

Workflow:
1. Know the columns before querying — but don't fetch what you already have. If the conversation or the page already gave you the relevant column keys and types, issue your first query directly. Only call get_dataset_schema when you have no column information, are unsure of an exact key spelling, or need sample values. The query tools return a 400 error listing a column's valid operations whenever a filter/sort/metric is rejected, so starting optimistically and self-correcting is cheaper than always fetching the schema first.
2. Choose the right tool for the task:
   - get_field_values: to discover distinct values of a column before filtering
   - search_data: to retrieve specific rows matching filters or text search. Do NOT use for statistics.
   - aggregate_data: to group rows by columns and count or compute per-group metrics (sum, avg, min, max)
   - calculate_metric: to compute a single global statistic (avg, sum, min, max, stats, percentiles, cardinality)

Filtering:
${filtersGuide}

Format:
- Every figure you state comes from a tool result: a count, sum or average the user did not ask for is left out, and one they asked for is computed with aggregate_data or calculate_metric — never a figure you worked out yourself from rows
- Present results concisely with clear labels
- For numeric results, round to 2 decimal places when appropriate
- When the result is tabular or aggregated, show the key values as a compact markdown table (the relevant rows or aggregation groups, typically up to ~20) with a short summary of the takeaways — never paste large raw result dumps
- Name a dataset by its slug or title only as a tool result showed them (get_dataset_schema prints both) — never put the dataset id in their place
- Respond in the same language as the user's question

Links:
- The "Filter query:" line a query tool prints is the only correct filter syntax for a link: copy it verbatim, never hand-assemble \`column=value\` filter params or reconstruct them from how the request worded the filter.
- Write a table/map link only when you know the dataset page URL (a tool result or the page gave it): it is that URL + /table?<filterQuery> (or /map). Without a URL, write no link: hand the filterQuery to the page's navigation tool when it has one.
- Map links additionally accept &category=<column_key>: the map then colors its features by that column's values and displays a legend. Offer it when the user wants to visually distinguish items on a map by a category-like column (string/boolean, few distinct values — at most ~12 render distinctly, check with get_field_values when unsure). Example: <dataset page URL>/map?<filterQuery>&category=type`
