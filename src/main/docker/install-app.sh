#!/bin/sh
# print commands as they run
set -x
# exit if any command fails
set -e

echo "the app deployment script has started"

echo "taking down any previous version of the app (if running)"
docker compose -f ~/team-project/dev.yml down || true

echo "checking for existing .env file"
if [ -f ~/team-project/.env ]; then
  echo "preserving existing ~/team-project/.env file"
else
  echo "no existing .env found — copying from repo"
  cp ~/team-project/.env ~/team-project/.env
fi

echo "loading env variables"
set -o allexport
. ~/team-project/.env
set +o allexport

echo "pulling the docker image"
docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
docker pull "${CI_REGISTRY_IMAGE}:${CI_COMMIT_TAG}"

echo "configuring the development docker compose script"
sed -i "4s|teamproject|${CI_REGISTRY_IMAGE}|" ~/team-project/dev.yml
sed -i "4s|latest|${CI_COMMIT_TAG}|" ~/team-project/dev.yml

echo "configuring the production docker compose script"
if [ -n "${CI_COMMIT_TAG}" ]; then
    echo "tagged/production commit"
    echo "production docker compose script setup with the current image"
    sed -i "4s|teamproject|${CI_REGISTRY_IMAGE}|" ~/team-project/prd.yml
    sed -i "4s|latest|${CI_COMMIT_TAG}|" ~/team-project/prd.yml
    echo "docker compose script saved with the current tagged image name"
    cp ~/team-project/prd.yml ~/prd.current.yml
fi

if [ -e "${HOME}/prd.current.yml" ]; then
    echo "untagged/dev commit and ~/prd.current.yml exists"
    echo "copying back the last tagged image docker compose script"
    cp ~/prd.current.yml ~/team-project/prd.yml
fi

echo "configuring caddy (web server)"
sed -i "s|DEVDOMAIN|$DEVURL|g" ~/team-project/Caddyfile
sed -i "s|DOMAIN|$URL|g" ~/team-project/Caddyfile
sed -i "s|EMAIL|$EMAIL|g" ~/team-project/Caddyfile
sed -i "s|ACME|$ACME|g" ~/team-project/Caddyfile
sed -i "s|DEPLOY_IP|$DEPLOY_IP|g" ~/team-project/Caddyfile

sudo mkdir -p ~/caddy/ || true
sudo chown -R "$USER:$USER" ~/caddy/ || true
cp ~/team-project/Caddyfile ~/caddy/Caddyfile

echo "re-starting the caddy web server"
docker compose -f ~/team-project/caddy.yml down || true
docker compose -f ~/team-project/caddy.yml up -d

echo "the app deployment script has finished successfully"
