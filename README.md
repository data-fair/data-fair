# Accessible Data
Opendata, Opensource, OpenApi
**Your data as a Web API with ease and power.**

[![Build Status](https://travis-ci.org/koumoul-dev/accessible-data.svg?branch=master)](https://travis-ci.org/koumoul-dev/accessible-data)
[![Coverage Status](https://coveralls.io/repos/github/koumoul-dev/accessible-data/badge.svg?branch=master)](https://coveralls.io/github/koumoul-dev/accessible-data?branch=master)

*WARNING : This repo is a work in progress, it is not ready yet for the public.*

## Indexing in ElasticSearch

Configure your host to run an Elasticsearch instance:

    sudo sysctl -w vm.max_map_count=262144

## Development environment
This project uses the following stack : Mongo, Express, VueJS, NodeJS and Docker. The primary language used is javascript with the ES7 syntax.
You should use linters and beautifiers compliants with the ES7 syntax in your editor.

Install dependencies and, run bundler and launch require services with docker-compose :
```
npm install
npm run build
docker-compose up -d
```

Run a development server with nodemon, webpack and browser-sync all watching, bundling, hot-reloading, etc:
```
npm run dev
    ```

Take an account in `test/resources/users.json` and use its email to login
