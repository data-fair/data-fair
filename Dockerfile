FROM node:22.13.1-alpine3.21 AS base

RUN npm install -g npm@11.1.0

WORKDIR /webapp

######################################################
# Stage: install prepair that depends on gdal and cgal
FROM base AS geodeps

RUN apk add --no-cache curl cmake make g++ linux-headers
RUN apk add --no-cache gdal gdal-dev
RUN apk add --no-cache boost-dev gmp gmp-dev mpfr-dev
RUN apk add --no-cache libressl4.0-libcrypto

# build CGAL (not yet present in alpine repos)
WORKDIR /tmp
RUN curl -L https://github.com/CGAL/cgal/releases/download/releases%2FCGAL-4.14.3/CGAL-4.14.3.tar.xz -o cgal.tar.xz
RUN tar -xf cgal.tar.xz
WORKDIR /tmp/CGAL-4.14.3
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

FROM base AS nativedeps

# these are also geodeps, but we need to install them here as they pull many dependencies
RUN apk add --no-cache gmp gdal-tools
RUN test -f /usr/bin/ogr2ogr
COPY --from=geodeps /usr/bin/prepair /usr/bin/prepair
COPY --from=geodeps /usr/local/lib/libCGAL.so.13 /usr/local/lib/libCGAL.so.13
COPY --from=geodeps /usr/lib/libmpfr.so.6 /usr/lib/libmpfr.so.6
RUN ln -s /usr/lib/libproj.so.25 /usr/lib/libproj.so
RUN test -f /usr/lib/libproj.so
# check that geo execs actually load
RUN prepair --help

RUN apk add --no-cache unzip

######################################
# Stage: nodejs dependencies and build
FROM nativedeps AS builder

RUN apk add --no-cache python3 make g++ curl
RUN apk add --no-cache sqlite-dev

ADD package.json .
ADD ui/package.json ui/package.json
ADD api/package.json api/package.json
ADD shared/package.json shared/package.json
ADD package-lock.json .
ADD patches patches
ADD ui/patches ui/patches

# use clean-modules on the same line as npm ci to be lighter in the cache
RUN npm ci && \
    ./node_modules/.bin/clean-modules --yes --exclude exceljs/lib/doc/ --exclude mocha/lib/test.js --exclude "**/*.mustache" --exclude yaml/dist/doc/

# Build UI
ADD ui ui 
RUN mkdir -p /webapp/ui/node_modules
ADD api/config api/config
ADD api/contract api/contract
ADD api/src/config.ts api/src/config.ts
RUN mkdir -p /webapp/api/node_modules
ADD shared shared
RUN mkdir -p /webapp/shared/node_modules
ENV NODE_ENV=production
RUN npm run build

# Cleanup /webapp/node_modules so it can be copied by next stage
RUN npm prune --production && \
    rm -rf node_modules/.cache

##################################
# Stage: main nodejs service stage
FROM nativedeps
MAINTAINER "contact@koumoul.com"

# We could copy /webapp whole, but this is better for layering / efficient cache use
COPY --from=builder /webapp/node_modules /webapp/node_modules
COPY --from=builder /webapp/api/node_modules /webapp/api/node_modules
COPY --from=builder /webapp/ui/node_modules /webapp/ui/node_modules
COPY --from=builder /webapp/shared/node_modules /webapp/shared/node_modules
COPY --from=builder /webapp/ui/nuxt-dist /webapp/ui/nuxt-dist
ADD ui/nuxt.config.js ui/nuxt.config.js
ADD ui/public/static ui/public/static
ADD api/src api/src
ADD api/scripts api/scripts
ADD api/config api/config
ADD api/contract api/contract
ADD shared shared
ADD upgrade upgrade

# Adding licence, manifests, etc.
ADD package.json .
ADD README.md BUILD.json* ./
ADD LICENSE .

# configure node webapp environment
ENV NODE_ENV=production
ENV DEBUG db,upgrade*

# the following line would be a good practice
# unfortunately it is a problem to activate now that the service was already deployed
# with volumes belonging to root
#USER node
VOLUME /data
EXPOSE 8080

CMD ["node", "--max-http-header-size", "64000", "--experimental-strip-types", "--no-warnings", "api/index.ts"]
