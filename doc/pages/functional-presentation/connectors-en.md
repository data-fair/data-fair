---
title: Catalog connectors
section: 3
subsection : 6
description : Catalog connectors
published: true
---

Connectors allow you to interact with other platforms or data services, both in reading and in writing.

In **writing**, the idea is to be able to push metadata into other **catalogs**. An example of a catalog is the national open data catalog [data.gouv.fr](https://www.data.gouv.fr/fr/): datasets published using Data Fair can be synchronized automatically and any change in the metadata is propagated to the remote catalog.

Pushing metadata to a catalog rather than being harvested by it offers several advantages including propagating changes immediately. Also, if there are changes to the Data Fair API, the connector will continue to work while a harvester might become inoperative.

Connectors can eventually push data to these catalogs but it is best to avoid this because of data duplication and synchronization issues. As mentioned before, data is indexed in a very efficient way with Data Fair and it is better to query the data directly from the APIs it offers.

<img src="./images/functional-presentation/catalogues.jpg"
     height="200" style="margin:40px auto;" alt="screenshot of a configuration of a publication on a catalog" />

As far as **reading** is concerned, the approach is however different and the connectors behave more like **metadata and data harvesters**. It is thus possible for each connector to configure the collection frequencies and the types of sources that one wishes to harvest.

Integrating the data into the platform makes it possible to index it and to be able to centralize access controls, an essential prerequisite if you want to be able to **merge** the data or consult different sources on a visualization.

It is possible to add new catalog connectors by following the instructions in [this section](./interoperate/connectors).

Compared to periodic processing, the main difference between catalog connectors is that they can process **several data sources that are referenced via an API** that lists them. The synchronization frequency is generally lower than for periodic processing.
