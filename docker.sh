mkdir -p data
set CID (docker run -d -p 6379:6379 -v $PWD/data/redis:/data redis:3.0.0)
set -gx REDIS_HOST (docker inspect --format '{{.NetworkSettings.IPAddress}}' $CID)
set -gx REDIS_PORT 6379
