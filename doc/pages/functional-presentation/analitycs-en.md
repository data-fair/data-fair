---
title: Portal analytics
section: 3
subsection : 12
updated: 2020-12-09
description : Portal usage statistics
published: true
---

Analytics let you measure the statistics of frequentation of the platform.  
It is possible to use **Matomo Analytics** (old piwik) or **Google Analytics** as a tracking system.

### Matomo Analytics
[Matomo Analytics](https://fr.matomo.org/) displays statistics in various visualizations: tables, graphs and maps. By selecting the different representations of statistics, it is possible to customize its dashboards.  
It is also possible to **anonymize the data** and record user journeys while complying with the recommendations of the [CNIL](https://www.cnil.fr/professionnel).

![Matomo](./images/functional-presentation/matomo.jpg)

It is possible to process personal data by activating the following features:
* **Right of access**: visitors can have access to their personal data
* **Right to portability**: visitor data may be retrieved in a machine-readable format
* **Right to be forgotten**: respect for the privacy of users by deleting their personal data
* **Right to withdraw consent**: visitors can revoke their consent at any time
* **Right to object**: visitors can easily opt out of being tracked
* **Anonymization features**: in one click, it is possible to anonymize personal data such as IP addresses, location and many more
* **Support for the "Do Not Track" functionality of browsers**: use of web browser settings regarding privacy settings
* **Delete historical data**: this data is automatically deleted from the database
* **Anonymization of historical data**: this data can be kept by anonymizing it.

### Google Analytics

The statistics under [Google Analytics](https://analytics.google.com/) are also available in different visualizations: tables, graphs and maps. It is also possible to customize its dashboards.

![Google Analytics](./images/functional-presentation/google-analytics.jpg)

### Configuration

The configuration of the user tracking system consists of two points.  
1. Configure the tracking system on the portal  
2. Configure events

<p>
</p>

**Configure the tracking system on the portal**

This process is available on the portal configuration.  
For **Google Analytics** you will need the *id number* and for **Matomo analytics** you will need the *tracker url* and *your site ID*.

![Configuration](./images/functional-presentation/config-GA-1.jpg)


**Configure events**
This process is available in the Data Fair settings in the *Outside calls (webhooks)* category.

You can define **which events** you want to track in your analytics:
* A new dataset has been created
* A dataset encountered an error
* A dataset has been finalized and is online
* A dataset has been published to a catalog
* A new reuse has been created
* A reuse encountered an error
* A reuse has been published on a catalog
* A dataset file has been updated

![Configuration](./images/functional-presentation/config-GA-2.jpg)
