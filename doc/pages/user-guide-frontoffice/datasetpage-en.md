---
title: Dataset page
section: 3
subsection : 1
updated: 2022-04-25
description : Access portal data
published: true
---

The page of a dataset is composed of several elements:
1. The title and description of the dataset
2. Dataset metadata and action buttons
3. Social media sharing icons
4. Visualizations

External visualizations can be added at the end of the dataset page.

<img src="./images/user-guide-frontoffice/datasetpage.png"
     height="600" style="margin:15px auto;" />)

### Title and description
The title and description of the dataset provide context to the data. The description presents the data, differents process to obtain the data or presents the producer of the data.

### Metadata and action buttons

Metadata is available as a card. They contain the number of lines, the size of the csv file, the data source when it is external, the license as well as the data producer when it is filled in.

Action buttons are also dsiplayed in this section.  
From left to right: the table, the full screen table, the generic map, the API documentation, the original file download, the enriched data download, the data schema, the HTML code to embed the table or the map to a site as well as the notification bell to subscribe to the dataset.

**Table**

The table lets you access the first 10,000 rows of the file.

<img src="./images/user-guide-frontoffice/tableau-1.png"
     height="400" style="margin:15px auto;" />

It contains several sections:
1. search bar  
2. mode of visualization of the lines
3. columns choice  
4. download  
5. filters on a column  
6. the filter on a value of a column  


<img src="./images/user-guide-frontoffice/tableau-2.png"
     height="350" style="margin:15px auto;" />

1. Filters on column values allow you to perform an "equal to" or "begins with" filter on columns with text and to perform "greater than or equal to" or "less than or equal to" filters on columns with numbers or dates. You can make several filters. The number of filtered rows is then available next to the search.  
2. Download of the filtered rows in different formats.   
Downloading in XLSX, ODS and Geojson format is limited to the first 10,000 rows.

<img src="./images/user-guide-frontoffice/tableau-3.png"
     height="350" style="margin:15px auto;" />

The column choices allow you to select the columns you want to display in the table.  
It is then possible to download the file with only the columns you have selected.

**The full screen table**

The full-screen table has the same functionality as the table.
1. search bar  
2. navigation pages
3. columns choice  
4. download  
5. filters on a column  
6. the filter on a value of a column  
7. navigation bar  

<img src="./images/user-guide-frontoffice/tableau-full.png"
     height="300" style="margin:15px auto;" />

**The generic map**

The generic map presents geographical data. A click on one of the points or geometries allows you to display the raw data of the element.

<img src="./images/user-guide-frontoffice/carte-g.png"
     height="300" style="margin:15px auto;" /

**API Documentation**

Each dataset has its own API. The API's interactive documentation allows developers to perform queries and view results quickly.

<img src="./images/user-guide-frontoffice/dataset-API.png"
     height="600" style="margin:15px auto;" />

**Download the original file**
The download button in the metadata allows you to download the raw data file. The format depends on the type of file imported by the data producer.

**Download enriched data**
The download button in the metadata allows you to download the CSV file containing the raw data as well as the enriched data. The enriched data are presented in the form of columns at the end of the table.

**Schema description**

You can access to the key, name, type, concept and description of each of the columns of the dataset.

<img src="./images/user-guide-frontoffice/dataset-code.png"
     height="300" style="margin:15px auto;" />

**Embed code**

This code allows you to embed a table or map of a dataset on an external site as an iframe.
Visitors of your site will have access to the data without having to navigate to the data portal.


**Attachments**

Attachments correspond to files added to the dataset. They can contain a dictionary of variables, a description of the data in PDF format or even an image corresponding to the data.

**Notifications**

It is possible to activate two types of notifications on a dataset:
* Updating data
* Data compatibility break

The data compatibility break corresponds to a modification of the dataset schema.

<img src="./images/user-guide-frontoffice/dataset-notif.png"
     height="200" style="margin:15px auto;" />

### Sharing icons

Sharing icons allow you to quickly share the page link on different social networks.
The share thumbnail is the thumbnail of the first visualization of the page.



### Visualization

Interactive visualizations make it easy to access and explore the dataset.  
The descriptions provides a better understanding of the data and the producer of the data can put forward some interesting points.

Clicking on the title of a visualization takes you to the visualization's page. On this page, you find the description and the visualization is displayed larger.
