---
title: Import a dataset
section: 4
subsection: 2
updated: 2021-09-20
description: Import a dataset
published: true
---

You can create a dataset on the [dashbord](./user-guide-backoffice/dashboard) or on the [datasets](./user-guide-backoffice/datasets) pages.

Three differents datasets on Data Fair.  

1. Upload a file from your computer
2. An editable dataset
3. A virtual dataset

### Upload a file

You can import files using any **Create a dataset** action buttons on Data Fair.  
The upload file process contains a list of the [formats](./user-guide-backoffice/file-formats) supported by Data fair.
It is possible to add [attachments](./user-guide-backoffice/attachements) in a zip archive to link it to the rows of the dataset.

Once the file is loaded, you are redirected to the dataset edit page. Data Fair continues processing the file on the dataset edit page.

Six have to be validated to use your dataset :

1. **Loading**
2. **Conversion** to a format used by the platform internally.
3. **Analysis**, which will determine the schema of the dataset.
4. **Indexing**, which will allow you to quickly find and access the data in the file.
5. **Enrichment**, which supplements the data in the file with external data.
6. The **Finalization**, which corresponds to the last processing before the dataset is available.

<p>
</p>

When finalization is complete, the dataset state is set to "available". It can then be [edited](./user-guide-backoffice/edition-dataset), enriched or used in the various visualizations.

### Incremental dataset  

An **editable dataset** is an empty editable dataset created without a data file.  
You will be able to define the columns of the dataset and then add the rows from Data Fair.

Each column is defined by its label and its type.

The schema of your **editable dataset** is defined when you have filled in all the columns of your dataset.

![Choix de l'application](./images/user-guide-backoffice/import-schema-editable.jpg)  
*Add columns to create your editable dataset*


You can then add rows to your dataset either through a form on a page of your site, your portal or through the **Data** section in the edit of the dataset.

![Formulaire](./images/user-guide-backoffice/import-formulaire.jpg)  
*Feedback form for portal visitors*

### Virtual dataset

A **virtual dataset** is a view of one or more datasets (children's dataset).  
It is used to present a portion of a dataset or to concatenate datasets with the same schema.


For exemple, it is possible to create a view of its municipality or its department on a national reference dataset without having to copy the data.  
As a **virtual dataset** is a portion of a dataset, when the reference dataset is updated, the virtual dataset of the town (or department) will also be updated. The data always remains up to date with respect to the reference data set.

![Jeu virtuel](./images/user-guide-backoffice/import-virtuel-valeur.jpg)  
*Filter or aggregate your datasets values*
