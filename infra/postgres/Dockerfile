# Official postgres is multi-architecture, including ARM64. This image adds PostGIS
# from PostgreSQL's official apt repository for Raspberry Pi 4 and Apple Silicon development.
FROM postgres:16-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
     | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
     > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
  && rm -rf /var/lib/apt/lists/*

COPY initdb/00-postgis.sql /docker-entrypoint-initdb.d/00-postgis.sql
