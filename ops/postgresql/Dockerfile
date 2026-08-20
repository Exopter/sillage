FROM postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y pgbackrest=2.59.1-1.pgdg12+1 && \
    install -d -o postgres -g postgres -m 0750 /var/spool/pgbackrest && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY ops/postgresql/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
