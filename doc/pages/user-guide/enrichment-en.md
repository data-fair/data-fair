---
title: Data enrichment
section: 4
subsection: 6
updated: 2021-09-20
description: Data enrichment
published: false
---


Enrichment allows you to import columns from a reference base. It is possible to cross-reference its data with data from open data such as the SIRENE database, INSEE data, the cadastre or the BAN.


* The **SIRENE** database brings together economic and legal information from more than 28 million french business establishments, including more than 11 million active establishments.
* **INSEE** data makes it possible to retrieve various informations on french administrative divisions (municipalities, departments, regions)
* The **cadastre** provides access to the various information concerning the plots. In particular, you can geocode plot codes or obtain the areas of your parcel on the french territory.
* The NAB is the **French National Address Base**. It allows you to geolocate addresses or find addresses from coordinates.


Depending on your data, you can choose an enrichment and complete your data.

## Create your own reference data

At this time, only **Super Instance Admins** can set a dataset as **Reference Data**.

1. Upload a file and associate at least one concept with a column.
2. Switch to super administrator mode
3. Define your **Reference Data**

Once these 3 steps have been completed, you can enrich other data with your **Reference data**.

### Upload and concept

When your dataset is created on your account, you will need to associate a concept to the column containing the uniques values. This column is the link to join data. Your column must contain unique codes, such as **INSEE codes** of municipality, **SIRENE codes** or **Parcel codes**.  

![Données de référence](./images/user-guide/enrichment-concept.jpg)  
*A column with a concept is in bold*

### Super admin mode

Super administrator mode is only available for users authorized in the instance.  
This mode is available in the menu at the top right on Data Fair.

![Données de référence](./images/user-guide/enrichment-superadmin.jpg)


### Reference data

The imported datasets with concepts can be used as reference data for **unitary searches** or / and for **mass enrichments**.  

The **unit searches** will allow to validate a code in your [editable datasets](./user-guide/import-dataset).  
If your editable dataset has the same concept as one of your reference datasets, when a value is filled in this column, the user will have valid propositions of this concept.


The **mass enrichments** will allow to perform a join and import columns from the reference data to your dataset.

![Données de référence](./images/user-guide/enrichment-master-data.jpg)  
*Cross your data with reference data*

On our image, we have created a SITADEL reference data with the concept **parcel code** which can be used in mass enrichments.  
Any other dataset in your account with the concept **parcel code** can use the SITADEL enrichment to import various columns from the SITADEL reference base.


### Create a concept


You can create your own unique value concepts in the **Private Vocabulary** section of **Settings** on your account. The concepts created will be available for your account.

A concept is defined by its **Identifier**, its **Title**, its **Description** and its **Category**. The identifier and title are required.

![Données de référence](./images/user-guide/enrichment-vocabulaire.jpg)  
*Create your own concepts*
