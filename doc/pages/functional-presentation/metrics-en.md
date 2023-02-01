---
title: Usage metrics
section: 3
subsection : 7
description : Usage metrics
published: true
---

There are two modules to track the use of the platform. The first is **analytics** and corresponds to the monitoring of user journeys on the data portal. This allows you to see which pages are consulted, where the users come from, the time they spend on the pages, ... The second corresponds to **measurements of API consumption** and allows you to see how the platform is used by other information systems or external sites.

## Analytics

It is possible to use **Matomo Analytics** (formerly Piwik) or **Google Analytics** as a tracking system. This is done simply by configuring the data portal by filling in a few fields in a form.

### Matomo Analytics

The configuration is done with the *url of the tracker* and the *id of your site*. The statistics under [Matomo Analytics](https://fr.matomo.org/) are available in different forms: tables, graphs and maps. By selecting the different representations of statistics, it is possible to customize its dashboards. It is also possible to **anonymise data** and record user paths while complying with the recommendations of the [CNIL](https://www.cnil.fr/professionnel).

<img src="./images/functional-presentation/matomo.jpg"
     height="300" style="margin:40px auto;" alt="screenshot Matomo" />

### Google Analytics

The configuration is done using the *ID number*. The statistics under [Google Analytics](https://analytics.google.com/) are also available in different forms: tables, graphs and maps. It is also possible to customize its dashboards.

<img src="./images/functional-presentation/google-analytics.jpg"
     height="300" style="margin:40px auto;" alt="screenshot of Google analytics" />


## APIs

Data Fair and the various associated services make extensive use of cache mechanisms to improve access times to resources, the precise statistics of use of the various access points of the platform can only be collected by a service associated with the platform's reverse-proxy.

Regarding the **compliance with the GDPR**, the data collected is anonymized and aggregated on a daily basis. You can access statistics for each dataset: **number of API calls and number of downloads**. The metrics are aggregated by user groups (owner organization, external authenticated users, anonymous, ...) or by call domain. Key figures are presented for the period requested, with a comparison to the previous period, which makes it possible to see whether the use of certain data is increasing or decreasing.

<img src="./images/functional-presentation/metrics.jpg"
     height="500" style="margin:40px auto;" alt="screenshot of the API metrics dashboard" />
