######################################################
# Stage: install prepair that depends on gdal and cgal
FROM node:16.13.2-alpine3.14 AS geodeps

RUN apk add --no-cache curl cmake make g++ linux-headers
RUN apk add --no-cache gdal gdal-dev
RUN apk add --no-cache boost-dev gmp gmp-dev mpfr-dev
RUN apk add --no-cache libressl3.3-libcrypto

# build CGAL (not yet present in alpine repos)
WORKDIR /tmp
RUN curl -L https://github.com/CGAL/cgal/releases/download/releases%2FCGAL-4.14/CGAL-4.14.tar.xz -o cgal.tar.xz
RUN tar -xf cgal.tar.xz
WORKDIR /tmp/CGAL-4.14
RUN cmake -D CMAKE_BUILD_TYPE=Release .
RUN make
RUN make install

# build prepair from source
WORKDIR /tmp
RUN curl -L https://github.com/tudelft3d/prepair/archive/v0.7.1.tar.gz -o prepair.tar.gz
RUN tar -xzf prepair.tar.gz
WORKDIR /tmp/prepair-0.7.1
RUN cmake -D CMAKE_BUILD_TYPE=Release .
RUN make
RUN mv prepair /usr/bin/prepair

RUN prepair --help

############################################################################################################
# Stage: prepare a base image with all native utils pre-installed, used both by builder and definitive image

FROM node:16.13.2-alpine3.14 AS nativedeps

# these are also geodeps, but we need to install them here as they pull many dependencies
RUN apk add --no-cache gmp gdal-tools
RUN test -f /usr/bin/ogr2ogr
COPY --from=geodeps /usr/bin/prepair /usr/bin/prepair
COPY --from=geodeps /usr/local/lib/libCGAL.so.13 /usr/local/lib/libCGAL.so.13
COPY --from=geodeps /usr/lib/libmpfr.so.6 /usr/lib/libmpfr.so.6
RUN ln -s /usr/lib/libproj.so.21.1.2 /usr/lib/libproj.so
RUN test -f /usr/lib/libproj.so
# check that geo execs actually load
RUN prepair --help

RUN apk add --no-cache unzip dumb-init

######################################
# Stage: nodejs dependencies and build
FROM nativedeps AS builder

RUN apk add --no-cache python3 make g++ curl
RUN ln -s /usr/bin/python3 /usr/bin/python
RUN apk add --no-cache sqlite-dev

WORKDIR /webapp
ADD package.json .
ADD package-lock.json .
ADD patches patches
# use clean-modules on the same line as npm ci to be lighter in the cache
RUN npm ci && \
    ./node_modules/.bin/clean-modules --yes --exclude exceljs/lib/doc/ --exclude mocha/lib/test.js --exclude "**/*.mustache"

# Adding UI files
ADD public public
ADD nuxt.config.js .
ADD config config
ADD shared shared
ADD contract contract

# Build UI
ENV NODE_ENV production
RUN npm run build && \
    rm -rf dist

# Adding server files
ADD server server
ADD scripts scripts
ADD upgrade upgrade

# Check quality
ADD .gitignore .gitignore
ADD test test
RUN npm run lint
RUN npm run test

# Cleanup /webapp/node_modules so it can be copied by next stage
RUN npm prune --production && \
    rm -rf node_modules/.cache

##################################
# Stage: main nodejs service stage
FROM nativedeps
MAINTAINER "contact@koumoul.com"

WORKDIR /webapp

# We could copy /webapp whole, but this is better for layering / efficient cache use
COPY --from=builder /webapp/node_modules /webapp/node_modules
COPY --from=builder /webapp/nuxt-dist /webapp/nuxt-dist
ADD nuxt.config.js nuxt.config.js
ADD server server
ADD scripts scripts
ADD upgrade upgrade
ADD config config
ADD shared shared
ADD contract contract

# Adding licence, manifests, etc.
ADD package.json .
ADD README.md BUILD.json* ./
ADD LICENSE .
ADD nodemon.json .

# configure node webapp environment
ENV NODE_ENV production
ENV DEBUG db,upgrade*
# the following line would be a good practice
# unfortunately it is a problem to activate now that the service was already deployed
# with volumes belonging to root
#USER node
VOLUME /data
EXPOSE 8080

CMD ["dumb-init", "node", "--max-http-header-size", "64000", "server"]
