######################################################
# Stage: install prepair that depends on gdal and cgal
FROM node:16.13.2-alpine3.14 AS prepair

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


######################################################
# Stage: install tippecanoe to generate mbtiles files
FROM node:16.13.2-alpine3.14 AS tippecanoe

RUN apk add --no-cache python3 make g++ bash git 
RUN apk add --no-cache sqlite-dev zlib-dev

WORKDIR /tmp
RUN git clone https://github.com/mapbox/tippecanoe.git
WORKDIR /tmp/tippecanoe
RUN make -j
RUN make install

RUN tippecanoe --help

############################
# Stage: nodejs dependencies
FROM node:16.13.2-alpine3.14 AS nodedeps

RUN apk add --no-cache python3 make g++ curl
RUN ln -s /usr/bin/python3 /usr/bin/python
RUN apk add --no-cache sqlite-dev

ENV NODE_ENV production
WORKDIR /webapp
ADD package.json .
ADD package-lock.json .
ADD patches patches
RUN npm install --production

##################################
# Stage: main nodejs service stage

FROM node:16.13.2-alpine3.14
MAINTAINER "contact@koumoul.com"

WORKDIR /webapp

# these are also geodeps, but we need to install them here as they pull many dependencies
RUN apk add --no-cache gmp gdal-tools
COPY --from=prepair /usr/bin/prepair /usr/bin/prepair
COPY --from=prepair /usr/local/lib/libCGAL.so.13 /usr/local/lib/libCGAL.so.13
COPY --from=prepair /usr/lib/libmpfr.so.6 /usr/lib/libmpfr.so.6
RUN ln -s /usr/lib/libproj.so.21.1.2 /usr/lib/libproj.so
RUN test -f /usr/lib/libproj.so
COPY --from=tippecanoe /usr/local/bin/tippecanoe /usr/local/bin/tippecanoe
COPY --from=nodedeps /webapp/node_modules node_modules

# check that geo execs actually load
RUN prepair --help
RUN tippecanoe --help

RUN apk add unzip

ENV NODE_ENV production
ENV DEBUG db,upgrade*
ADD LICENSE .
ADD package.json .
ADD package-lock.json .
ADD patches patches
ADD nodemon.json .

# Adding UI files
ADD public public
ADD nuxt.config.js .
ADD config config
ADD shared shared
ADD contract contract
RUN npm run build

# Adding server files
ADD server server
ADD scripts scripts
ADD upgrade upgrade
ADD README.md BUILD.json* ./

VOLUME /data
EXPOSE 8080

CMD ["node", "--max-http-header-size", "64000", "server"]
