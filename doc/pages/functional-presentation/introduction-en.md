---
title: Introduction
section: 1
updated: 2020-12-09
description : Introduction
published: true
---
**Data Fair** and its ecosystem make it possible to implement a platform for sharing (internal or opendata) and data visualization. This platform can be intended for the general public, who can access data through adapted interactive visualizations, as well as for a more expert public who can access data through APIs.  
**FAIR** refers to data which meet principles of [findability, accessibility, interoperability, and reusability](https://fr.wikipedia.org/wiki/Fair_data).

The **datasets** uploaded on the platform are indexed. Indexing a dataset greatly increases its reusability and enables text searches in large data sets of millions of records or in data visualizations.

The **front-office** pages allows you to access the dataset catalog and to be able to search in it. It is possible to consult the datasets directly, whether with generic views (tables, simple maps, etc.) or more specific preconfigured visualizations. The data is disseminated through pages that present it in the form of stories (data storytelling). Finally, developers can access the documentation for the various **APIs of the platform**.

The **back-office** allows you to manage the different elements of the platform: user accounts, datasets and visualizations. Administrators can set up the environment and manage access permissions to data and visualizations. Depending on their profile, back-office users will be able to create, edit, enrich, delete datasets, maps and graphs.  
The back office makes it possible to create **data portals** (private or open data) and also to access various portal usage statistics (analytics).

### Main advantages of the platform

* The ability to load data in different formats.
* The publication of data in the form of visualizations, portals and APIs
* A methodological framework for publishing highly reusable semantic data
* The enrichment of data to give them even more value.
* Possible representations thanks to a large choice of interactive displays (graphs, maps, search engine, etc.).
* An intuitive interface for a quick start
* The ability to extend the platform with specific visualizations


### Key Concepts

The three central concepts are: **datasets**, **remote services** and **applications**. The purpose of this service is to be able to easily use **applications** adapted to different professions and powered by a combination of **remote services** and user-specific data.

**Datasets** are created by users by uploading files: the service stores the file, analyzes it and derives a data schema. The data is then indexed according to this scheme and can be queried through its own Web API.

The user can semanticize the fields of the **data sets**, for example by determining that a column containing data on 5 digits is a field of the Postal Code type. This semantization allows 2 things: the **data can be enriched** and used for certain processing if the appropriate **remote services** are available, and the data **can be used in applications** adapted to their concepts.

In addition to file-based **datasets**, Data Fair also allows the creation of editable **datasets** which are editable in real time and also virtual **datasets** which are configurable views of one or various **datasets**.

**Remote Services** provide functionality in the form of Web APIs external to Data Fair that comply with OpenAPI 3.0 interoperability rules.
One of Data Fair's goals is to allow non-IT people to easily use third-party APIs with their own data. There are 2 ways to exploit **remote services**: the user can use them to add columns to his **datasets** in delayed time (eg geocoding) and **applications** can exploit them in real time (eg map backgrounds).

**Remote services**, connected to a Data Fair instance, are not managed by users directly but rather made available to them by administrators.

**Applications** enable the full potential of user data and **remote services** to be exploited. A few examples: a dataset containing commune codes can be projected onto a map of the French administrative division, a dataset containing parcel codes can be projected onto the cadastre, etc.
