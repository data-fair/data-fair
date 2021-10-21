---
title: Periodic processings
section: 14
updated: 2021-09-20
description : Process and update your data frequently
published: false
---

**Periodic processing** allows to fetch data, transform it and publish it on the platform.  
They can be used for **automatic data update** on regular intervals.

Periodic processing differs from [catalog connectors](./user-guide/catalogues) on several points:

* Processing are limited to a small set of input and output sources. Typically, it can retrieve data in one place, metadata in another, and dump the data into a Data Fair source.
* **Collection frequencies can be higher**: Data can be collected with a few seconds intervals, which is suitable for publishing IOT data.

![Traitements périodiques](./images/user-guide/processings.jpg)  
*Collect, transform and publish your data automatically*
