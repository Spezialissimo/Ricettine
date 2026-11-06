#!/usr/bin/env bash
# Mounts the EBS data volume at /srv/ricettine. Formats it only when it has no filesystem yet,
# and is safe to run on every boot. DEVICE, MOUNTPOINT, FSTAB and WAIT_TRIES exist for the test.
set -euo pipefail

DEVICE="${DEVICE:-/dev/sdf}"
MOUNTPOINT="${MOUNTPOINT:-/srv/ricettine}"
FSTAB="${FSTAB:-/etc/fstab}"
LABEL="ricettine-data"
WAIT_TRIES="${WAIT_TRIES:-60}"

# The attachment is made after the instance starts, so the device can appear late.
tries=0
until [ -e "$DEVICE" ]; do
  tries=$((tries + 1))
  if [ "$tries" -ge "$WAIT_TRIES" ]; then
    echo "mount-data: $DEVICE did not appear" >&2
    exit 1
  fi
  sleep 5
done

if [ -z "$(blkid -o value -s TYPE "$DEVICE" 2>/dev/null || true)" ]; then
  echo "mount-data: no filesystem on $DEVICE, formatting"
  mkfs.ext4 -L "$LABEL" "$DEVICE"
fi

mkdir -p "$MOUNTPOINT"
# By LABEL, so the device name (nvme vs sdf) never matters; nofail so a missing volume cannot block boot.
grep -q "^LABEL=$LABEL " "$FSTAB" || echo "LABEL=$LABEL $MOUNTPOINT ext4 defaults,nofail 0 2" >>"$FSTAB"
grep -qs " $MOUNTPOINT " /proc/mounts || mount "$MOUNTPOINT"

# Bind-mount sources used by compose.aws.yaml
mkdir -p "$MOUNTPOINT/db"
