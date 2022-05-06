---
title: Dataset management
section: 3
subsection : 1
description : Dataset management
published: false
---

The datasets are represented in the form of sheets on the platform. A card has a title and data information. The information contains the name of the file, its size, the number of lines and the themes of the data. The data owner icon and publishing status are also available on each card.

![Fiche d'un jeu de données](./images/functional-presentation/jeu-2.jpg)

### Data formats

There are several types of datasets on the platform, files, editable datasets, virtual datasets.

* The **file datasets** correspond to data files loaded on the platform. Several file formats are supported such as CSV, TSV, XLS, TXT, GeoJson, KML, ESRI Shapefile, …

* **Editable datasets** are data stored in the database and are more suitable for data that changes regularly. They are updated by API and are well suited for IOT data for example.

* **Virtual datasets** correspond to views of one or serveral datasets. They allow more advanced access control. For example, they can be used to create a public view, restricted to some rows or columns, of a more complete data set that remains private.

### Add a dataset
It is possible to import different data sources on Data Fair. You can already import files directly from your computer. It will soon be possible to import data from external sources like Airtable or Google drive.

After the file is loaded, it is converted to a more standard format internally and then automatically parsed to determine the schema of the dataset. The data is indexed and can be enriched with other external data. Final processing is carried out to calculate properties linked to the data (field cardinalities, geographical bounds, etc.) then the data set is available to be edited or used.

After this step, the data can be consulted at least in a table and can be sorted and filtered. If the concepts of **Latitude** and **Longitude** are assigned in the schema, the data can also be consulted on a map. If they have an **Images** concept, a gallery is generated.

### Edit a dataset

The edit page of a dataset allows you to work on the presentation and reusability of this dataset. This page allows you to modify the title of the dataset, update the data, complete the data schema, semanticize the data so that it can be used in visualizations or enriched via complementary services.

#### Data schema

The edit page of a dataset allows, among other things, to fill in the concepts in the **Data schema** section.  
Les concepts sont des notions connues pour la plateforme. Ils permettent d'**augmenter la réutilisabilité** de vos données et de faire le lien entre vos données et les fonctionnalités de la plateforme.

![Schéma d'un jeu de données](./images/functional-presentation/schema.jpg)


Using the concepts, you can **enrich your data** to give them even more value or project your data on a map.  
A concept is unique to a column of a dataset. You cannot have two different columns with the same concept for a dataset.

Concepts are necessary for the representation of certain visualizations. For example, your data cannot be projected on a map if you have not associated the concepts **Latitude** and **Longitude** to the columns that contain the latitude and longitude values.

In the **Data schema** section, you can fill in labels for each of the fields. These labels are used in the table view and in the different visualizations of the dataset.

#### Data enrichment

It is possible to enrich your data with data from open data such as the **SIRENE** database, the **cadastre**, **INSEE data and the BAN**.
* The SIRENE database brings together economic and legal information from more than 28 million business establishments, of which more than 11 million are active.
* The cadastre provides access to the various information concerning the plots. In particular, you can geocode parcel codes or obtain the surfaces of your parcels.
* INSEE data can be used to retrieve various information on administrative divisions (municipalities, departments, regions)
* The NAB is the French National Address Base. It allows you to geolocate addresses or find addresses from coordinates.

Depending on the data you have, you can choose the enrichment that suits you and thus give more value to your data.

#### Data Sharing Permissions

An administrator can control **data access permissions** with pressision. Depending on the role assigned to a user, the latter has the right to access, read and/or modify the content of the source.

![Persmissions d'un jeu de données](./images/functional-presentation/permissions.jpg)

We can set the role of **user** to a group of people and define whether they can access and read a platform resource.

It is also possible to manage permissions more finely and give rights to a single or multiple users. The list of people with permissions on a dataset is available on the edit page of this set.

#### Dataset Log

A dataset's log allows you to check the **change history** on the dataset.

![Journal d'un jeu de données](./images/functional-presentation/journal.jpg)

The log allows the **traceability** of changes to data sets, parameters and authorizations.

#### Attachments

It is possible to associate attachments to each row of a dataset. This is done by associating an archive in zip format that contains the files to be associated. There must also be a column in the dataset containing the names of the files to be associated with each row. Two types of files can be linked to lines: images (png, jpg, …) or documents (pdf, docx, xlsx, …). In the case of documents, they are indexed **fulltext** by the platform and searches take into account the content of these documents.

Attachments can also be directly attached to a dataset. For example, you can add documentation files or rich metadata.
