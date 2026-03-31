# Agent Dataset Tools Design

## Goal

Add dataset listing, description, and data querying capabilities to the back-office agent, following the pattern established by `use-agent-navigation-tools.ts`. Data-heavy tools are wrapped in a subagent to protect the main agent's context window.

## Key Differences from MCP

- Back-office API (`/datasets`) instead of catalog (`/catalog/datasets`)
- `$fetch` (ofetch with cookie auth) instead of axios with API key headers
- JSON Schema with `as const` instead of Zod
- Returns markdown/CSV strings only — no outputSchema, no structuredContent

## Files

### `ui/src/composables/use-agent-dataset-tools.ts`

Main agent tools. Registered in default-layout.vue alongside navigation tools.

**`list_datasets`**
- Input: optional `q` (search text), `page` (default 1), `size` (default 10)
- Endpoint: `GET /datasets?select=title,status,topics,count,updatedAt&q=...&page=...&size=...`
- Returns: markdown list with id, title, status, count, updatedAt. Includes total count and pagination info.

**`describe_dataset`**
- Input: `datasetId`
- Endpoint: `GET /datasets/{datasetId}`
- Returns: markdown with metadata (title, description, status, owner, visibility, topics, keywords, temporal/spatial, license, frequency) and schema table (key, type, title, description, concept).

### `ui/src/composables/use-agent-dataset-data-tools.ts`

Subagent tools + subagent registration. All in one file.

Registers 5 tools via `useAgentTool`, then calls `useAgentSubAgent` with those tool names and a prompt instructing the subagent to always call `get_dataset_schema` first.

**`get_dataset_schema`**
- Input: `datasetId`
- Endpoint: `GET /datasets/{datasetId}` (select schema fields) + `GET /datasets/{datasetId}/lines?size=3`
- Returns: markdown schema table + CSV sample lines

**`search_data`**
- Input: `datasetId`, optional `q`, `filters` (record with suffix-based keys), `select`, `sort`, `size`, `page`
- Endpoint: `GET /datasets/{datasetId}/lines`
- Returns: CSV of matching rows + count/pagination info

**`aggregate_data`**
- Input: `datasetId`, `groupByColumns`, optional `metric` (column + type), `filters`, `sort`
- Endpoint: `GET /datasets/{datasetId}/values_agg`
- Returns: markdown-formatted aggregation results

**`calculate_metric`**
- Input: `datasetId`, `fieldKey`, `metric` (avg/sum/min/max/stats/value_count/cardinality/percentiles), optional `filters`
- Endpoint: `GET /datasets/{datasetId}/metric_agg`
- Returns: markdown with metric result

**`get_field_values`**
- Input: `datasetId`, `fieldKey`, optional `q`, `sort`, `size`
- Endpoint: `GET /datasets/{datasetId}/values/{fieldKey}`
- Returns: markdown list of values

**Subagent registration:**
```ts
useAgentSubAgent({
  name: 'dataset_data',
  description: 'Query dataset data rows, compute aggregations, and explore field values. Provide the dataset ID and describe what data you need.',
  prompt: 'You are a data querying assistant. Always call get_dataset_schema first to understand the dataset structure before using other tools. Return results concisely.',
  tools: ['get_dataset_schema', 'search_data', 'aggregate_data', 'calculate_metric', 'get_field_values']
})
```

### Registration in `default-layout.vue`

Add imports and calls inside the existing `toolsScope.run()` block:
```ts
toolsScope.run(() => {
  useAgentNavigationTools({ route, router, navigationGroups, breadcrumbItems: breadcrumbs.items })
  useAgentDatasetTools()
  useAgentDatasetDataTools()
})
```

## Pattern for Future Resource Types

Each resource type (applications, processings, etc.) follows the same two-file pattern:
- `use-agent-{resource}-tools.ts` — list + describe for main agent
- `use-agent-{resource}-data-tools.ts` — data tools + subagent (if applicable)
