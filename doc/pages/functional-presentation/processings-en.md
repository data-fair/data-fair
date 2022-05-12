---
title: Periodic processings
section: 3
subsection : 5
description : Periodic processings
published: true
---

Periodic processing will **find** data in certain places, **transform** it and **import** it on the platform. They are made in the form of open source plugins, and the list of available treatments is constantly evolving.

For example, the *download-file* plugin, which is quite generic, covers several use cases: this processing will look for files in one place to publish them on the platform. It is able to access files via **ftp, sftp or http(s)** protocols. It generally works following data processing carried out by ETLs who submit their results in the form of files that can be accessed remotely.

Each plugin has its own settings (access code, data set to update, ...) but all processing has the same scheduling options. Processes can be triggered every hour, day, week, month or be set to be triggered manually.

It is possible to generate an API key specific to the process to create a **webhook allowing it to be triggered**: a process in an ETL can for example create a file on a shared space then call the url of the webhook to that the import processing is triggered.


![Collecteurs](./images/functional-presentation/collecteurs.jpg)

A contributor can access the **success status** of the different executions of a job, as well as the detailed logs of its executions. He can subscribe to processing notifications to be informed when a processing fails, or when alerts are present in the logs.
