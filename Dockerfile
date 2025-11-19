FROM node:24.11.1-alpine3.22 AS base

# RUN npm install -g npm@11.1.0

WORKDIR /app

##########################
FROM base AS geodeps

RUN apk add --no-cache curl cmake make g++ linux-headers
RUN apk add --no-cache gdal gdal-dev
RUN apk add --no-cache boost-dev gmp gmp-dev mpfr-dev
RUN apk add --no-cache libressl4.1-libcrypto
RUN apk add --no-cache git

# build CGAL (not yet present in alpine repos)
WORKDIR /tmp
RUN curl -L https://github.com/CGAL/cgal/releases/download/v5.6.2/CGAL-5.6.2.tar.xz -o cgal.tar.xz
RUN tar -xf cgal.tar.xz
WORKDIR /tmp/CGAL-5.6.2
RUN cmake -D CMAKE_BUILD_TYPE=Release .
RUN make
RUN make install

# build prepair from source
WORKDIR /tmp
RUN git clone https://github.com/data-fair/prepair.git
WORKDIR /tmp/prepair
RUN git checkout fix-build-filesystem
RUN cmake -D CMAKE_BUILD_TYPE=Release .
RUN make
RUN mv prepair /usr/bin/prepair

RUN prepair --help

##########################
FROM base AS nativedeps

# these are also geodeps, but we need to install them here as they pull many dependencies
RUN apk add --no-cache gmp gdal-tools
RUN apk add --no-cache boost
RUN test -f /usr/bin/ogr2ogr
COPY --from=geodeps /usr/bin/prepair /usr/bin/prepair
# COPY --from=geodeps /usr/local/lib/libCGAL.so.13 /usr/local/lib/libCGAL.so.13
COPY --from=geodeps /usr/local/include/CGAL /usr/local/include/CGAL
COPY --from=geodeps /usr/lib/libmpfr.so.6 /usr/lib/libmpfr.so.6
RUN ln -s /usr/lib/libproj.so.25 /usr/lib/libproj.so
RUN test -f /usr/lib/libproj.so
# check that geo execs actually load
RUN prepair --help

##########################
FROM base AS package-strip

RUN apk add --no-cache jq moreutils
ADD package.json package-lock.json ./
# remove version from manifest for better caching when building a release
RUN jq '.version="build"' package.json | sponge package.json
RUN jq '.version="build"' package-lock.json | sponge package-lock.json

##########################
FROM nativedeps AS installer

RUN apk add --no-cache python3 make g++
RUN npm i -g clean-modules@3.0.4 patch-package@8.0.0
COPY --from=package-strip /app/package.json package.json
COPY --from=package-strip /app/package-lock.json package-lock.json
ADD ui/package.json ui/package.json
ADD api/package.json api/package.json
ADD shared/package.json shared/package.json
ADD embed-ui/package.json embed-ui/package.json
ADD patches patches
# full deps install used for building
# also used to fill the npm cache for faster install of api deps
RUN npm ci --no-audit --no-fund

ADD /api/types api/types
ADD /api/doc api/doc
ADD /api/contract api/contract
RUN npm run build-types

##########################
FROM installer AS builder

ADD ui ui 
RUN mkdir -p /app/ui/node_modules
ADD api/config api/config
ADD api/contract api/contract
ADD api/types api/types
ADD api/src/config.ts api/src/config.ts
RUN mkdir -p /app/api/node_modules
ADD shared shared
RUN mkdir -p /app/shared/node_modules
ENV NODE_ENV=production
RUN npm run build

##########################
FROM installer AS embed-ui-builder

ADD /api/config api/config
ADD /api/src/config.ts api/src/config.ts
ADD /api/src/ui-config.ts api/src/ui-config.ts
ADD /shared shared
ADD /embed-ui embed-ui
RUN npm -w embed-ui run build

##########################
FROM installer AS api-installer

RUN cp -rf node_modules/@img/sharp-linuxmusl-x64 /tmp/sharp-linuxmusl-x64 && \
    cp -rf node_modules/@img/sharp-libvips-linuxmusl-x64 /tmp/sharp-libvips-linuxmusl-x64 && \
    npm ci -w api --prefer-offline --omit=dev --omit=optional --no-audit --no-fund && \
    npx clean-modules --yes "!exceljs/lib/doc/" "!**/*.mustache" && \
    mkdir -p node_modules/@img && \
    cp -rf /tmp/sharp-linuxmusl-x64 node_modules/@img/sharp-linuxmusl-x64 && \
    cp -rf /tmp/sharp-libvips-linuxmusl-x64 node_modules/@img/sharp-libvips-linuxmusl-x64
RUN mkdir -p /app/api/node_modules
RUN mkdir -p /app/shared/node_modules

##########################
FROM base AS parquet-writer-builder
RUN apk add --no-cache curl build-base gcc
RUN curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain stable -y
ENV PATH=/root/.cargo/bin:$PATH
RUN npm i -g @napi-rs/cli@3.2.0
ADD /parquet-writer parquet-writer
WORKDIR /app/parquet-writer
RUN npm run build

##########################
FROM nativedeps AS main

# We could copy /app whole, but this is better for layering / efficient cache use
COPY --from=api-installer /app/node_modules /app/node_modules
COPY --from=api-installer /app/api/node_modules /app/api/node_modules
COPY --from=api-installer /app/api/types /app/api/types
COPY --from=api-installer /app/api/doc /app/api/doc
COPY --from=api-installer /app/shared/node_modules /app/shared/node_modules
COPY --from=builder /app/ui/nuxt-dist /app/ui/nuxt-dist
COPY --from=embed-ui-builder /app/embed-ui/dist embed-ui/dist
COPY --from=parquet-writer-builder /app/parquet-writer/package.json parquet-writer/
COPY --from=parquet-writer-builder /app/parquet-writer/*.js parquet-writer/
COPY --from=parquet-writer-builder /app/parquet-writer/*.d.ts parquet-writer/
COPY --from=parquet-writer-builder /app/parquet-writer/*.mts parquet-writer/
COPY --from=parquet-writer-builder /app/parquet-writer/*.node parquet-writer/
ADD ui/nuxt.config.js ui/nuxt.config.js
ADD ui/public/static ui/public/static
ADD /api api
ADD /shared shared
ADD /upgrade upgrade

ADD package.json README.md LICENSE BUILD.json* ./

WORKDIR /app/api

# configure node webapp environment
ENV NODE_ENV=production
ENV DEBUG db,upgrade*

# the following line would be a good practice
# unfortunately it is a problem to activate now that the service was already deployed
# with volumes belonging to root
#USER node
VOLUME /data
EXPOSE 8080
EXPOSE 9090

CMD ["node", "--max-http-header-size", "64000", "--experimental-strip-types", "--no-warnings", "index.ts"]
