---
title: Introduction
section: 1
description : Introduction
published: true
---
**Data Fair** and its ecosystem make it possible to implement a platform for sharing data (internal or opendata) and visualizations. This platform can be intended for the general public, who can access data through adapted **interactive visualizations**, as well as for a more expert public who can access data through APIs.

The word **FAIR** refers to data which meet principles of [“Findability, Accessibility, Interoperability and Reusability”](https://fr.wikipedia.org/wiki/Fair_data). This is made possible thanks to the **indexation** of the data on the platform. It makes it possible to carry out complex searches in volumes of several million records and to access more easily and quickly what interests us. Access to data through **standardized and documented APIs** makes it possible to interface the platform with other information systems and facilitates data reusability.

<img src="./images/functional-presentation/FAIR.jpg"
     height="160" style="margin:30px auto;" />

Data users access the platform through **one or more data portals**. They allow you to access the dataset catalog and explore it in different ways. It is possible to consult the datasets directly, whether with generic views (tables, simple maps, etc.) or more specific preconfigured visualizations. Data is disseminated through pages that present it in the form of data storytelling, **making it easier for anyone to understand**. Users can subscribe to notifications about updates and developers can access interactive documentation for various platform APIs. The portals can be embellished with **content pages** presenting the approaches, contributors or reuses put forward, for example.

Administrators and data contributors have access to a **back-office** which allows them to manage the various elements of the platform: user accounts, datasets and visualizations. Administrators can set up the environment and manage access permissions to data and visualizations. According to their profile, back-office users will be able to create, edit, enrich, delete datasets, maps and graphs. The back-office makes it possible to create **data portals** (internal or open data) and also to access various portal usage metrics.

## General operation
**Datasets** are generally created by users by **loading tabular or geographic files**: the service stores the file, analyzes it and derives a data schema. The data is then indexed according to this scheme and can be queried through its own Web API.

In addition to file-based datasets, Data Fair also allows the creation of **editable by form** datasets and virtual datasets which are **configurable views of one or more datasets**.

The user can semanticize the fields of the datasets by **attributing concepts** to them, for example by determining that a column containing data on 5 digits is a field of the Postal Code type. This semantization allows 2 things: the data can **be enriched** from reference data or itself become **reference data** to enrich others, and the data can be used in **visualizations adapted to their concepts**.

**Visualizations** help unlock the full potential of user data. A few examples: a dataset containing commune codes can be projected onto a map of the French administrative division, a dataset containing parcel codes can be projected onto the cadastre, etc.

<!-- ![FAIR](./images/functional-presentation/data_and_settings.png) -->

## Main advantages of the platform
Data Fair makes it possible to set up an organization centered around data:
* Ability to load data in different file formats or by entering via form, even allowing crowd sourcing
* Consultation of data through a wide choice of interactive visualizations (graphs, maps, search engines, ...)
* Possibility to create several portals according to the use cases (opendata, internal exchanges, ...)
* Easy creation of data APIs and enrichment of data to give it even more value
* Implementation of periodic processing to automatically feed the platform with data
* Secure framework, open source code and use of standards
