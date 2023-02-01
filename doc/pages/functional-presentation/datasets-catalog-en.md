---
title: Data catalog
section: 2
subsection : 2
updated: 2020-12-09
description : Data catalog
published: true
---

The data catalog is a search engine allowing **quick access** to datasets likely to interest the user. In addition to the textual search field, it is possible to access the datasets by theme or by concept present in the data. For example, it is possible to list all geographic datasets by filtering by *Latitude* concept, or all data related to companies by filtering by *SIREN*.

<img src="./images/functional-presentation/search.jpg"
     height="100" style="margin:15px auto;" alt="screenshot of the data catalog page of a portal" />


The list of datasets is browsed using an infinite scroll mechanism, equally well suited for **desktop or mobile** use. It is also possible to sort the results according to different criteria (Alphabetical, creation date, etc.). The list of results obtained can be exported in CSV format with one click.

The results on this page are presented in the form of thumbnails that display information such as the title of the dataset, its date of update or the themes associated with it. A bit of the description is also displayed, but it can be replaced by an image to make a more "visual" catalog.

In addition to navigating to a dataset's details page, tiles provide action buttons for:
* Visualize the data with a **tabular view** in which one can sort the columns, paginate, carry out fulltext searches and download the filtered data
* Possibly visualize the data with a **map view** when the data allows it.
* Access the **interactive API documentation**
* Consult the **data diagram**

<img src="./images/functional-presentation/home-dataset.jpg"
     height="140" style="margin:15px auto;" alt="screenshot of some dataset cards" />

The catalog presents the datasets that the user has the right to see. If he is not logged in, he will only see opendata games, if he is logged in and a member of the organization that owns the portal, he will also be able to see private data games.
