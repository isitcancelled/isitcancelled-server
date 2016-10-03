FROM alpine:edge
RUN sed -i 's/dl-4/dl-5/g' /etc/apk/repositories

RUN apk --update add nodejs

SUB alpine:edge
RUN sed -i 's/dl-4/dl-5/g' /etc/apk/repositories
RUN apk --update add nodejs
ADD package.json /src/package.json
WORKDIR /src
RUN npm install -q
ADD . /src
RUN npm run build
RUN rm -Rf test node_modules src .git
RETURN /src /app

ENV NODE_ENV production
WORKDIR /app
VOLUME /logs
RUN npm install -q --production
CMD ["npm", "start"]
