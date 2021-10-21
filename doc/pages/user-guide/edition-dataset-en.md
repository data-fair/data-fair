---
title: Edit a dataset
section: 4
subsection: 3
updated: 2021-09-20
description: Add metadata to your dataset
published: false
---


On the [Datasets page](https://koumoul.com/s/data-fair/datasets), the datasets are represented by a card. To edit a dataset click on the card.  

The edition page contains several sections: structure, metadata, data, visualizations, data sharing, activity, action buttons and content.

## Structure

The **Structure** section contains of the Schema and the Enrichment.

### Schema


The data schema allows to visualize all of the columns in your dataset.  
Clicking on a column allows you to access the column information

1. Selected column
2. Label and description of the column
3. Key, type and cardinality of the column
4. [Concept](./user-guide/concept) associated to the column

<p>
</p>

[Concepts](./user-guide/concept) are known elements for the platform and are used in visualizations or the [enrichment](./user-guide/enrichment).

![schema](./images/user-guide/dataset-schema-edit.jpg)  
*Visualize the schemas of your data and fill in concepts to make sense of your data*  

### Enrichment  

Enrichment allows to import columns from a reference base. It is possible to improuve you data and cross with data from open data such as the SIRENE database, INSEE data, the cadastre or the BAN.

Several steps are necessary to create a data enrichment:

1. On the schema, associate the [concepts](./user-guide/concept) necessary for the enrichment you need.  
2. Choose the desired extension.  
3. Choose the columns you want to add and apply the enrichment

![enrichissement](./images/user-guide/dataset-enrichement.jpg)  
*Enrich your data get even more value*

The dataset will be processed and the progress can be viewed on the 6 different states of the dataset. Once the finalization step is complete, your data set is enriched.  

In the lower part of the enrichment sheet, you will find the enrichment log, as well as a button to delete the enrichment.  
The enrichment report allows you to check the quality of the enrichment and list the different lines that have not been enriched.

The columns that you have added to your dataset with [enrichment](./user-guide/enrichment) will be automatically added to the dataset schema and it will be possible to download the enriched file with the additional columns.

## Metadata
The **Metadata** section is made up of Information and Attachments.  

### Informations
In this section, you will find information about your dataset, such as:  

* The title
* The description,
* the name, extension and size of your file
* Last update date of metadata and data
* Lines number
* License
* The thematic
* The source

![Informations](./images/user-guide/dataset-informations.jpg)

### Attachments

Attachments are used to attach a document to data such as a description or documentation in a PDF file for example.  
The attached files will be available for download on the dataset page on your portals.

## Data

In this section, the data can be viewed in table or map form (if the **Latitude** / **Longitude** or **Geometry** concepts are assigned to your data ).  

![Données](./images/user-guide/dataset-donnees.jpg)  
*Access your data in table or map form*

The table allows you to explore your data through several features.  
It is possible to perform text searches and filters on a column value, the first 10,000 results will be displayed.

Your search result can be dowloaded in various file formats.  

## Visualizations

In this section, there is a the list of visualizations using your dataset.  
You can quickly navigate between the different visualizations to configure them or create a new visualization.  
The order of the visualizations can be modified with a simple drag and drop of the visualization cards. This order will be applied on the dataset page of your portals.

![Visualisations](./images/user-guide/dataset-visualisations-edit.jpg)  
*Configure multiple visualizations to better understand your data*

It is possible to add **External Reuse**.  
External reuses will be displayed on the dataset portal page as a summary cards or the reuse will be framed on the page if you have the embed code.

## Share

In this section you will be able to define the permissions of your dataset, the publication on your portals and the publication on external catalogs.  
By default, a dataset is private.

### Permissions

The list of your portals is available in this section.  

Datasets can be published to multiple portals. Broadcast of data in stages is possible, you can publish your data internally, get feedback, then publish the data on an opendata portal. Publishing on different portals increase the quality of the shared data with multiple feedback.  

Publishing on several portals allow to have the same data on all the portals without duplicating the data. In addition, when the data is updated, it will be updated for all portals.

![Permissions](./images/user-guide/dataset-partage.jpg)

### Catalogue

The list of configured catalogs is available the [Catalogues](./user-guide/catalogues) page is available in this section.  
You can thus publish your data to various external catalogs.

## Activity

The activity log allows you to view the history of the last modifications made to the dataset.  

![Activité](./images/user-guide/dataset-activity.jpg)  
*Latest events in your dataset*

## Action buttons

On the right of the edit page you have access to several action buttons:
* **Original file**, allows you to download the original file
* **Enriched file **, allows you to download the file with all the new columns that you added thanks to the [enrichissement](./user-guide/enrichment) in CSV format.
* **Update**, allows you to modify the dataset loaded on your account with a new one from your computer.
* **Integrate on a site**, allows access to the HTML code to integrate the table or the data map to an external site.
* **View on the data portal**, allows access to the page on your portal. If you have published the dataset on more than one portal, there will be various links.
* **API**, provides access to the interactive documentation of the dataset API.
* **Delete**, remove the dataset from the platform.
* **Change owner**, allows you to transfer the dataset to another account.

## Contents

The content section allows you to quickly navigate between the different sections of the dataset edit page.
