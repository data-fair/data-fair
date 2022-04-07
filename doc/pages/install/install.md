---
title: Installation
section: 1
updated: 2020-12-10
description : Installation
published: true
---

A complete Data Fair installation is constitued of multiple Web services, to understand how it works please read about the [technical architecture]({{DOC_BASE}}technical-architecture/).

The recommended installation is based on [Docker](https://docker.com) containers, and [this image](https://github.com/data-fair/data-fair/pkgs/container/data-fair) in particular.

## Requisites

### Hardware setup

This documentation was written using Linux (Ubuntu 20.04), but any Linux running a recent Docker service should work the same. Minimal recommended configuration is as follow:

 * At least 2 cores, 4 is better if mongodb and elasticsearch are deployed too
 * 4 Gb of memory, 16 if mongodb and elasticsearch are deployed too
 * 50 Gb of SSD hard drive
 * 100 Mbits of up and down bandwidth

### Docker

Install Docker following the [official documentation](https://docs.docker.com/engine/installation/).

To use the standard installation recipes install Docker Compose following the [official documentation](https://docs.docker.com/compose/install/).

### MongoDB

Data Fair requires MongoDB 4.x. It can be [installed in various ways](https://docs.mongodb.com/v4.4/installation/).

**Manual installation of MongoDB is optional**, you can install it alongside Data Fair Web services using the Docker Compose recipes below.

### ElasticSearch

Data Fair requires ElasticSearch 7.x with the ingest-attachment plugin. See [installation instructions here](https://www.elastic.co/guide/en/elasticsearch/reference/6.0/install-elasticsearch.html).

**Manual installation of ElasticSearch is optional**, you can install it alongside Data Fair Web services using the Docker Compose recipes below.

## Recipe 1 : simple local installation

This recipe runs Data Fair and its most important dependencies locally on your computer.

  - download files [data-fair.env]({{DOC_BASE}}install-resources/local/data-fair.env), [default.conf]({{DOC_BASE}}install-resources/local/default.conf) and [docker-compose.yaml]({{DOC_BASE}}install-resources/local/docker-compose.yaml) next to each other in a directory.
  - run `docker-compose --env-file data-fair.env up -d` in the directory
  - check that all containers are up with `docker-compose ps`
  - you should be able to open [http://localhost](http://localhost)
  - the superadmin user is *admin@test.com* on the login page you can click on *Renew the password* then on *Open the development mail box* to define its password then use it to login

## Recipe 2 : full installation

This recipe can run Data Fair on a virtual machine exposed to the internet.

  - download files [data-fair.env]({{DOC_BASE}}install-resources/full/data-fair.env), [default.conf]({{DOC_BASE}}install-resources/full/default.conf) and [docker-compose.yaml]({{DOC_BASE}}install-resources/full/docker-compose.yaml) next to each other in a directory.
  - carefully read and edit the *.env* file
  - edit the line *server_name* in default.conf
  - run `docker-compose --env-file data-fair.env up -d` in the directory
  - check that all containers are up with `docker-compose ps`
  - you should be able to open data-fair in your browser using the name of the machine

This recipe completes the previous one in many ways that you can chose to use or not. These improvements are detailed below.

### Mails transport configuration

By changing the MAILS_TRANSPORT and MAILDEV_ACTIVE variables you can switch from the temporary maildev solution to a proper mail transport. Please note that this element of the configuration should be managed quite early as it is unsafe to expose maildev to the internet.

### HTTPS using letsencrypt certificate

The nginx reverse proxy is configured to expose every services over the HTTPS, this will improve security. The certificate provider is letsencrypt and the certificate is automatically generated which requires that the domain name and the machine are available from the internet.

The related changes are:
  - the use of another image for the nginx container (jonasal/nginx-certbot)
  - the new volume nginx-letsencrypt
  - variable BASE_URL in data-fair.env
  - the whole beginning of the server block in default.conf.

### Reverse proxy cache

The nginx reverse proxy is configured to act as a cache for Data Fair, this will improve response times and limit the load on the service. It is mostly important when exposing Data Fair to the internet and creating public datasets.

The related changes are:
  - the definition of data-fair-cache in default.conf
  - the new volume nginx-cache in docker-compose.yaml

### Server / worker separation

The *data-fair* service has a new MODE=server variable and there is a new service *data-fair-worker*. This will improve the responsiveness of the HTTP server when there is heavy work going on in the worker (files parsing, etc).

### Portals

Portals is a companion service to Data Fair that lets you create private or open data portals using Data Fair as a backend. Look at the new left navigation items (as normal user and as super admin).

The related changes are:
  - the new service *portals*
  - the new volume *portals-data*
  - a new location rule in default.conf
  - the new variables EXTRA_NAV_ITEMS and EXTRA_ADMIN_NAV_ITEMS in data-fair.env and the *data-fair* service

### Processings

Processings is a companion service to Data Fair that lets you define and run tasks based on plugins published on npm. Look at the new left navigation items (as normal user and as super admin).

The related changes are:
  - the new services *processings* and *processings-worker*
  - the new volume *processings-data*
  - a new location rule in default.conf
  - the new variables EXTRA_NAV_ITEMS and EXTRA_ADMIN_NAV_ITEMS in data-fair.env and the *data-fair* service

### Metrics

Metrics is a companion service to Data Fair that can receive logs over UDP from the reverse proxy to store aggregated usage metrics of your datasets. Look at the new left navigation item.

The related changes are:
  - the new service *metrics*
  - a new location rule in default.conf
  - the new *log_format* and *access_log* rules in default.conf
  - the new variables EXTRA_NAV_ITEMS and EXTRA_ADMIN_NAV_ITEMS in data-fair.env and the *data-fair* service