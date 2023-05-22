---
title: Dataset management
section: 3
subsection : 1
description : Dataset management
published: false
---

Datasets make data available to the user, as well as information about the data (metadata) such as the license associated with the data, the date of update, the owner of the data, etc.


### Types of datasets

There are several types of datasets on the platform, files, editable datasets, virtual datasets and external datasets.

* The **file data sets** correspond to data in tabular or cartographic format loaded on the platform. Several file formats are supported such as CSV, TSV, OpenDocument, XLS, XLSX, GeoJson, KML, KMZ, ESRI Shapefile, GPX and iCalendar. According to needs new file formats are regularly added. When a file is uploaded, it is converted to a more standard format internally, then automatically parsed to determine the schema of the dataset. The contributor can then modify this schema, for example determining that a column will have its data indexed as a string rather than an integer.

* **Editable data sets** are data stored in the database and are more suitable for data that changes regularly, or updated by business people who just want to modify a few lines. The creation of this type of dataset is done by editing its data schema: we define each column and its type. For data produced by computer systems (IOT data for example), these data sets are generally updated by API. In the case of manual updates by agents, they are updated via an input form.

* **Virtual datasets** correspond to views of one or more datasets. They allow for more advanced access control. For example, they can be used to create a public view, restricted to certain rows and certain columns, of a more complete data set that remains private. This also makes it possible to anonymize data. For example, a national dataset can be restricted to a single department. The other use case for this type of dataset is to operate with vintage or territorialized data: we can thus publish data each year via a file that always has the same format and then create a view that groups together the different years.

* **External datasets** do not have indexed data on the platform. They allow you to enter metadata (title, description, licence, etc.) and to associate data with it in formats that cannot be used by the platform (PDF, Zip Archive, etc.) or to catalog data present on other platforms by providing a link in the description.

### Data schema

The platform supports tabular data indexing. Each dataset (except external datasets) has a schema which is the description of the different columns (or fields) that make it up. At a minimum, each column has an identifier and a type, but it is possible to enter additional information.

A label and a description allow for more readable and understandable column headers. The field can have a group which allows it to be found more quickly when there are many columns. If the field is text type, you can opt for rich formatting: it will then be possible to put HTML or Markdown in this field. The field can also be defined as being multi-valued, in this case we specify the separator used in the column between the different values.

<img src="./images/functional-presentation/schema.jpg"
     height="330" style="margin:20px auto;" alt="screenshot of the edition of the schema of a dataset" />

The last element that can be filled in, and which is of considerable importance, is the **business type** associated with the field. This is done by selecting a **concept from a thesaurus**. There is a base of concepts common to the entire platform, and it is possible to **add your own concepts**. These are generally linked to vocabulary from the Semantic Web, the concept of postal code for example has the identifier `http://schema.org/postalCode`.

This business typing **increases the reusability** of the data and allows 2 things within the platform: **enrichment from other data**, and the proposal of **adapted visualizations** (by simplifying the configuration of these): the concepts *latitude* and *longitude* allow for example to configure maps with markers.

### Schema repository

To improve data acquisition and reuse, we propose a schema repository from https://schema.data.gouv.fr/schemas.html which lists different public data schemas for France.

When creating an editable dataset, it is possible to choose one of the proposed schemas. The data entered will be standardized which will increase their reusability both in terms of uploading different data to a common destination to merge the data but also in the use of visualization.  
For example, an application allowing to search and visualize deliberations published in SCDL format could be used by any community that publishes its deliberation data with the adapted schema.

### Metadata and attachments

Some metadata are filled, such as metadata or data update dates, and the user who created or modified it. The edit page of a dataset allows to modify the various metadata of this set. It is possible to modify the title and the description, to define a **license of use** and to associate **themes**. The lists of usable licenses and themes are common to the entire organization and can be edited by administrators

It is possible to associate **attachments to each row** of a dataset. This is done by associating an archive in zip format that contains the files to be associated. There must also be a column in the dataset containing the names of the files to be associated with each row. Two types of files can be linked to lines: images (png, jpg, ...) or documents (pdf, docx, xlsx, ...). In the case of documents, they can be indexed **fulltext** by the platform so that searches take into account the content of these documents.

Attachments can also be **directly attached to a dataset**. For example, you can add documentation files or rich metadata. It can also be used to publish data that cannot be indexed by the platform in the case of an *external* dataset.

### Master data and enrichment

Some data may be used in different places and in different processes by organizations. It is possible to define a dataset as being **master data** (master-data in English). These are data that refer to particular concepts, and the platform makes pooled master data available to all organizations.

The data of the **Sirene database** are attached to the concepts of *code siren*, *code siret* and *code APE* for example. There are also data made available from the **cadastre** (via *plot codes*) or INSEE data (via the *commune code*, *department code*, etc.). Finally, there is address data, from the **BAN**, which allows geocoding. New reference data is regularly added to the platform, and each organization can create its own pivot datasets!

These master data are of great value, because they allow you to **easily complete the other data**. As part of the incremental game input forms, you can refer to master data by assigning a concept to a certain field, and the **form will propose a list of values** (with a search engine if it is large ) to select what will be put in the field. It is thus possible to constrain the entry in a field and to ensure that the values ​​in it are all valid according to certain business rules!

The second possibility to complete the data is to set up **enrichments**: columns are then automatically added to the dataset and the values ​​filled in from one or more other columns. For example, columns that have the concepts *street number*, *street name* and *postal code* can be completed with address data and be geocoded, which allows the data to be projected on a map. When data is updated, enrichments are automatically updated, and a dataset can have multiple enrichments from different master data.

The reference data can also be used via virtual sets to offer the reference data on its portal.  
It is then possible to create a virtual set, on the portal of his organization, which will be a view of the reference data set. So when the reference data is updated, the virtual game will also be updated.  
Virtual sets can have filters on the column values. It is for example possible to filter the data of the **Sirene database** on a territory and on some **APE code** to propose a dataset on an activity sector on your territory. It will then be very easy to configure a cartographic visualization to explore these data.

### Permissions and publication of data

An administrator can finely control **data access permissions**. The data is *private*, ie only authenticated members of the organization can consult them. It is possible to make the data *public*, in this case everyone, including non-registered users, will be able to access it. You can also define access rights for certain users or partner organizations. An advanced mode allows you to define the permissions for each access point of the API of a dataset: you can for example make access to metadata public while access to data remains restricted.

<img src="./images/functional-presentation/permissions.jpg"
     height="350" style="margin:20px auto;" alt="screenshot of the edition of permissions on a dataset"/>

When a dataset has just been created, it is not yet available in the various data portals of the organization. It must first be **published in one or more portals**. In the context of open&nbsp;data portals, the dataset must also have public access permission in addition to being published.

This publication mechanism allows you to work in an agile way: for example, you can have a **recipe portal** on which you publish the datasets that you want to open soon, accompanying them with visualizations. Visualizations can highlight a problem in the data or a bad structuring of it, problem that can be seen by several people because the data is already published on a portal. Once we reach the **desired publication quality**, we un-publish the dataset from the recipe portal and publish it on one or more production portals.

<img src="./images/functional-presentation/portail-publication.jpg"
     height="350" style="margin:20px auto;" alt="screenshot of the publication of a dataset on portals"/>

It is also possible to publish a dataset on portals or data catalogs external to the platform, this is described in more detail in the section on *catalog connectors*.

### Event logs

Each step in the processing of a dataset is registered in the associated log. It is thus possible to trace the actions, their dates, their durations and any errors encountered.
