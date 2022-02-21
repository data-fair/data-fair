---
title: Update a dataset
section: 4
subsection: 4
updated: 2021-09-20
description: Update a dataset
published: false
---

Updating a dataset can be done manually on the [dataset edition page](./user-guide/edition-dataset)  or can be automated with [periodic processing](./user-guide/processing).

### Manual update

Before performing a manual update, check your data schema. For example, if a visualization uses your dataset, verify that the columns used by the visualization are still present in the new file you are importing.

The update is done using the **Update** action button on the [dataset edit page](./user-guide/edition-dataset) you want to update.  
You need to choose the new file to load on your computer and upload your dataset on Data Fair.

The file will be submitted to 6 processing steps:

1. The **Loading**, which represents the progress bar.
2. The **Conversion** to a format used by the platform.
3. The **Analysis**, which will determine the schema of the dataset.
4. **Indexing**, which will allow quick access to the data in the file.
5. The "**Enrichment**, which will take into account the new values ​​of the dataset and will perform a new enrichment according to the extensions added for the dataset.
6. The **Finalization**, which corresponds to the last processing before the dataset is available.

<p>
</p>

![Visualisations Carto](./images/user-guide/update.png)

When the finalization is complete, the dataset goes into "draft".

Draft mode allows to check the structure of the schema to add concepts to the **new columns** and to consult the first 100 lines of the new file.  
New columns will be displayed in red.  
You can **cancel** the update if the schema does not match what you want.

After performing the schema verification and giving, the **Validate draft** button allows you to launch the last stage of the update.

The file will again be subjected to the 6 processing steps.  
When finalization is complete, the dataset goes to "available" state.  
It can then be edited, enriched and used in visualizations.
