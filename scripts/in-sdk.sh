#!/usr/bin/env bash
set -euo pipefail
repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
image=$(sed -n 's/.*"sdk_image":"\([^"]*\)".*/\1/p' "$repository_root/prismpm.lock")
if [[ ! $image =~ ^[a-z0-9.-]+(:[0-9]{1,5})?/[a-z0-9./_-]+@sha256:[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'prismpm.lock must select an immutable SDK image' >&2
  exit 64
fi
if (( $# == 0 )); then set -- just vv; fi
docker_credentials=$(mktemp -d)
trap 'rm -rf "$docker_credentials"' EXIT
if test -f "$HOME/.docker/config.json"; then
  cp "$HOME/.docker/config.json" "$docker_credentials/config.json"
else
  printf '{}\n' > "$docker_credentials/config.json"
fi
docker run --rm --init \
  --user "$(id -u):$(id -g)" \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  --volume "$repository_root:$repository_root" \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$docker_credentials:/tmp/prismpm-credentials:ro" \
  --workdir "$repository_root" \
  --env DOCKER_CONFIG=/tmp/prismpm-credentials \
  --env BUILDX_CONFIG=/tmp/prismpm-buildx \
  --env SDK_IMAGE="$image" \
  --entrypoint bash "$image" -c 'exec "$@"' bash "$@"
