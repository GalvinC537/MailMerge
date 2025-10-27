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
  echo "ERROR: ~/team-project/.env not found. The workflow should have created it."
  echo "Aborting to avoid starting with missing secrets."
  exit 1
fi

echo "loading env variables"
set -o allexport
. ~/team-project/.env
set +o allexport

echo "pulling the docker image (anonymous pull from public GHCR)"
# image ref like: ghcr.io/galvinc537/mailmerge:<sha>
docker pull "${CI_REGISTRY_IMAGE}:${CI_COMMIT_TAG}"

echo "configuring the development docker compose script"
# expects line 4 to contain 'image: "teamproject:latest"' (JHipster template)
sed -i "4s|teamproject|${CI_REGISTRY_IMAGE}|" ~/team-project/dev.yml
sed -i "4s|latest|${CI_COMMIT_TAG}|" ~/team-project/dev.yml

echo "configuring the production docker compose script"
if [ -n "${CI_COMMIT_TAG}" ]; then
  echo "tagged/production commit"
  sed -i "4s|teamproject|${CI_REGISTRY_IMAGE}|" ~/team-project/prd.yml
  sed -i "4s|latest|${CI_COMMIT_TAG}|" ~/team-project/prd.yml
  cp ~/team-project/prd.yml ~/prd.current.yml
fi

if [ -e "${HOME}/prd.current.yml" ]; then
  echo "untagged/dev commit and ~/prd.current.yml exists; restoring last tagged compose"
  cp ~/prd.current.yml ~/team-project/prd.yml
fi

echo "configuring caddy (web server)"
sed -i "s|DEVDOMAIN|$DEVURL|g"  ~/team-project/Caddyfile
sed -i "s|DOMAIN|$URL|g"       ~/team-project/Caddyfile
sed -i "s|EMAIL|$EMAIL|g"      ~/team-project/Caddyfile
sed -i "s|ACME|$ACME|g"        ~/team-project/Caddyfile
sed -i "s|DEPLOY_IP|$DEPLOY_IP|g" ~/team-project/Caddyfile

mkdir -p ~/caddy/ || true
# ensure we own the folder (no sudo needed if $HOME)
chown -R "$USER:$USER" ~/caddy/ || true
cp ~/team-project/Caddyfile ~/caddy/Caddyfile

echo "re-starting the caddy web server"
docker compose -f ~/team-project/caddy.yml down || true
docker compose -f ~/team-project/caddy.yml up -d

echo "the app deployment script has finished successfully"
