# Ricettine

A self-hosted recipe app for friends and family. One image, one Postgres, no required configuration.

## Quick start

```sh
docker compose up -d
```

This pulls the published image (`compose.yaml` needs no toolchain, and can be downloaded on its own). Open <http://localhost:8080> and create the admin account. That's it: the first visitor to a fresh install is guided through setup, and the admin can then invite other people with single-use links.

Data lives in two named volumes: `db-data` (Postgres) and `app-data` (uploaded images, mounted at `/data`).

## More documentation

Configuration, HTTPS, upgrading, backups and hosting on AWS: [docs/deployment.md](docs/deployment.md).

## Development

Building, testing, the check scripts, screenshots and demo content: [docs/development.md](docs/development.md).
