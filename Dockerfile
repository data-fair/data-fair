FROM koumoul/webapp-base:1.6.0
MAINTAINER "contact@koumoul.com"

RUN apk add --update python make g++ cmake linux-headers gmp

# Install the prepair command line tool
RUN mkdir /prepair
WORKDIR /tmp
RUN curl -L http://download.osgeo.org/gdal/2.3.1/gdal-2.3.1.tar.gz -o gdal.tar.gz && \
    tar -xzf gdal.tar.gz && \
    rm gdal.tar.gz && \
    cd gdal-2.3.1 && \
    ./configure && \
    make && \
    make install && \
    cd .. && \
    rm -rf gdal-2.3.1
WORKDIR /tmp
RUN curl -L https://github.com/CGAL/cgal/releases/download/releases%2FCGAL-4.12/CGAL-4.12.tar.xz -o cgal.tar.xz && \
    tar -xf cgal.tar.xz && \
    rm cgal.tar.xz && \
    cd CGAL-4.12 && \
    cmake . && \
    make && \
    make install && \
    cd .. && \
    rm -rf CGAL-4.12
WORKDIR /tmp/prepair
RUN curl -L https://github.com/tudelft3d/prepair/archive/v0.7.1.tar.gz -o prepair.tar.gz && \
    tar -xzf prepair.tar.gz && \
    rm prepair.tar.gz && \
    cmake . && \
    make && \
    mv prepair /prepair/prepair && \
    cd .. && \
    rm -rf prepair

ENV NODE_ENV production
WORKDIR /webapp
ADD package.json .
ADD package-lock.json .
RUN npm install --production && node-prune

# Adding UI files
ADD public public
ADD nuxt.config.js .

# Adding server files
ADD server server
ADD shared shared
ADD contract contract
ADD config config
ADD scripts scripts
ADD README.md .

VOLUME /webapp/data
EXPOSE 8080

CMD ["node", "server"]
