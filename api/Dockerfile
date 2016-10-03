FROM scratch

SUB golang:1.6
RUN apt-get update && apt-get install -yyq musl-dev musl-tools
ADD . /go/src/git.dolansoft.org/lorenz/isitcancelled/api
WORKDIR /go/src/git.dolansoft.org/lorenz/isitcancelled/api
RUN go get ./
RUN CC=musl-gcc go build --ldflags '-linkmode external -extldflags "-static -s"'
RETURN /go/src/git.dolansoft.org/lorenz/isitcancelled/api/api /api

EXPOSE 3003
CMD ["/api"]
