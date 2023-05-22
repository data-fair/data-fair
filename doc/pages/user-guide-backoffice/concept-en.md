---
title: Concepts
section: 4
subsection: 5
updated: 2021-09-20
description: Make sens of your data
published: true
---

The concepts are known elements for the platform. Your data is more explicit.  
Concepts increase the reusability of your data and   **link your data to the functionalities of Data&nbsp;Fair** such as [enrichment](./user-guide-backoffice/enrichment).  

The dataset edition page allows to select the concepts in the **Schema** section.

1. Selected column
2. Label and description of the column
3. Key, type and cardinality of the column
4. Concept associated with the column

![Concepts](./images/user-guide-backoffice/schema-concept.jpg)  
*Concepts are needed to create of some visualizations.*


A concept is unique for a dataset, it can only be attributed once to a dataset. For example, if the **Latitude** concept is associated with a column of your dataset, it cannot be associated with another column.

## List of concepts

It is possible to create your own concepts and use them in your [reference data](./user-guide-backoffice/enrichment).  
Here is the default list of concepts used by Data&nbsp;Fair:

* **Label**: An easily readable label
* **Description**: A small descriptive text (HTML content accepted)
* **Image**: URL to an illustration image of the current document
* **Street number**: A house number, which can contain words like bis or ter
* **Street or locality**: A street or locality name
* **Address**: An full address written on one line
* **Municipality**: Municipality name
* **Postal code**: Postal code, on 5 digits
* **Municipality code**: INSEE code of the municipality, on 5 characters, not to be confused with the postal code.
* **Department code**: Department code on 2 or 3 characters
* **Region code**: Region code on 2 digits
* **Latitude**: Geographic coordinate related to the equator
* **Longitude**: Geographic coordinate related to the Greenwich meridian
* **Latitude / Longitude**: latitude / longitude separated by a comma
* **SIRET**: The SIRET number is a 14-digit numeric identifier made up of the SIREN (9 digits) and the NIC (5 digits)
* **SIREN**: The SIREN number is a company digital identifier (9 digits)
* **APE code**: The APE code (main activity exercised) identifies the main branch of activity of the company or of the self-employed person with reference to the classification of French activities
* **Legal category (level 3)**: The legal category of level 3, sometimes called legal nature is a code on 4 numeric characters. It comes from a nomenclature of the French government.
* **Date of the event**: Corresponds to the date of the event
* **Creation date**: Date on which the resource was created
* **Parcel code**: The cadastral parcel code is the unique number assigned by the Cadastre Service to identify a cadastral parcel at the national level. It is composed of 14 characters: INSEE commune code of 5 digits + cadastre section code of 5 characters + cadastre parcel number of 4 digits. For example 56197037ZC0063 is a valid french code.
* **GeoJSON geometry**: A geometry (point, polygon, line, etc.) in GeoJSON format.
* **Attached files**: Relative path to a file attached to the dataset or URL to a file hosted outside
