FROM koumoul/webapp-base:1.12.2
MAINTAINER "contact@koumoul.com"

RUN apk add --no-cache --update python make g++ unzip

# Install the prepair command line tool
RUN mkdir /prepair
WORKDIR /tmp
# cf https://github.com/appropriate/docker-postgis/pull/97/commits/9fbb21cf5866be05459a6a7794c329b40bdb1b37
RUN apk add --no-cache --virtual .build-deps cmake linux-headers boost-dev gmp gmp-dev mpfr-dev && \
    apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/main libressl3.0-libcrypto && \
    apk add --no-cache --virtual .gdal-build-deps --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing gdal-dev && \
    apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/testing gdal proj && \
    curl -L https://github.com/CGAL/cgal/releases/download/releases%2FCGAL-4.12/CGAL-4.12.tar.xz -o cgal.tar.xz && \
    tar -xf cgal.tar.xz && \
    rm cgal.tar.xz && \
    cd CGAL-4.12 && \
    cmake . && \
    make && \
    make install && \
    cd .. && \
    rm -rf CGAL-4.12 && \
    curl -L https://github.com/tudelft3d/prepair/archive/v0.7.1.tar.gz -o prepair.tar.gz && \
    tar -xzf prepair.tar.gz && \
    rm prepair.tar.gz && \
    cd prepair-0.7.1 && \
    cmake . && \
    make && \
    mv prepair /prepair/prepair && \
    cd .. && \
    rm -rf prepair-0.7.1 && \
    apk del .build-deps .gdal-build-deps
RUN test -f /usr/lib/libproj.so.15
RUN ln -s /usr/lib/libproj.so.15 /usr/lib/libproj.so

# install tippecanoe to generate mbtiles files
RUN apk add --no-cache --virtual .tippe-deps bash sqlite-dev zlib-dev && \
    git clone https://github.com/mapbox/tippecanoe.git && \
    cd tippecanoe && \
    make -j && \
    make install && \
    cd .. && \
    rm -rf tippecanoe && \
    apk del .tippe-deps

ENV NODE_ENV production
ENV DEBUG db,upgrade*
WORKDIR /webapp
ADD LICENSE .
ADD package.json .
ADD package-lock.json .
ADD patches patches
RUN npm install --production && node-prune
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
ADD README.md VERSION.json* .

VOLUME /data
EXPOSE 8080

CMD ["node", "--max-http-header-size", "64000", "server"]
