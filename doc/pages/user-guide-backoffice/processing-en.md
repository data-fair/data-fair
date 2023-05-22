---
title: Periodic processings
section: 14
updated: 2021-09-20
description : Process and update your data frequently
published: true
---

**Periodic processing** allows to fetch data, transform it and publish it on the platform.  
They can be used for **automatic data update** on regular intervals.

Periodic processing differs from [catalog connectors](./user-guide-backoffice/catalogues) on several points:

* Processing are limited to a small set of input and output sources. Typically, it can retrieve data in one place, metadata in another, and dump the data into a Data&nbsp;Fair source.
* **Collection frequencies can be higher**: Data can be collected with a few seconds intervals, which is suitable for publishing IOT data.
* Periodic processing can only be configured by a platform administrator. Please [contact us](https://koumoul.com/contact) if you are interested in periodic treatment.

![Traitements périodiques](./images/user-guide-backoffice/processings.jpg)  
*Collectez, transformez et publiez vos données automatiquement*

Periodic processing includes several configuration elements:

* Active or not active
* The time step: Monthly, weekly, daily or hourly
* The action: Create a new dataset or Update an existing dataset
* Parameters: allow, for example, to delete uploaded data used for periodic processing
<p> </p>
The execution history is available and errors are reported in this log.

![Traitements périodiques](./images/user-guide-backoffice/processings-2.jpg)  
