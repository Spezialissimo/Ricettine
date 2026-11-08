#!/usr/bin/env bash
# Mounts the EBS data volume at /srv/ricettine. Formats it only when blkid positively reports
# "no filesystem" (exit status 2), a low-level probe (blkid -p) agrees and the first MiB reads as zeros;
# anything else aborts. Safe to run on every boot.
# DEVICE, VOLUME_ID, BYID_DIR, MOUNTPOINT, FSTAB, WAIT_TRIES and WAIT_SECONDS exist for the test and cloud-init.
set -euo pipefail

DEVICE="${DEVICE:-/dev/sdf}"
VOLUME_ID="${VOLUME_ID:-}" # e.g. vol-0123456789abcdef0; on Nitro the stable path is /dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol...
BYID_DIR="${BYID_DIR:-/dev/disk/by-id}"
MOUNTPOINT="${MOUNTPOINT:-/srv/ricettine}"
FSTAB="${FSTAB:-/etc/fstab}"
LABEL="ricettine-data"
WAIT_TRIES="${WAIT_TRIES:-60}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"

if command -v udevadm >/dev/null 2>&1; then udevadm settle || true; fi

# The attachment is made after the instance starts, so the device can appear late.
byid=""
if [ -n "$VOLUME_ID" ]; then byid="$BYID_DIR/nvme-Amazon_Elastic_Block_Store_${VOLUME_ID//-/}"; fi
found=""
tries=0
while [ -z "$found" ]; do
  if [ -e "$DEVICE" ]; then
    found="$DEVICE"
  elif [ -n "$byid" ] && [ -e "$byid" ]; then
    found="$byid"
  else
    tries=$((tries + 1))
    if [ "$tries" -ge "$WAIT_TRIES" ]; then
      echo "mount-data: neither $DEVICE nor ${byid:-a by-id path} appeared" >&2
      exit 1
    fi
    sleep "$WAIT_SECONDS"
  fi
done

# blkid exit status: 0 = found, 2 = nothing found, anything else = an error we must not "fix" with mkfs
status=0
fstype="$(blkid -o value -s TYPE "$found")" || status=$?
if [ "$status" -eq 2 ] || { [ "$status" -eq 0 ] && [ -z "$fstype" ]; }; then
  # Exit 2 also means "impossible to gather info": confirm with a low-level probe and a look at the data
  probe=0
  blkid -p "$found" >/dev/null 2>&1 || probe=$?
  if [ "$probe" -ne 2 ]; then
    echo "mount-data: blkid -p on $found exited $probe (not 2), refusing to format" >&2
    exit 1
  fi
  if ! cmp -s -n 1048576 "$found" /dev/zero; then
    echo "mount-data: first MiB of $found is not blank, refusing to format" >&2
    exit 1
  fi
  echo "mount-data: no filesystem on $found, formatting"
  mkfs.ext4 -L "$LABEL" "$found"
elif [ "$status" -ne 0 ]; then
  echo "mount-data: blkid failed with status $status on $found, refusing to format" >&2
  exit 1
fi

mkdir -p "$MOUNTPOINT"
# By LABEL, so the device name (nvme vs sdf) never matters; nofail so a missing volume cannot block boot.
grep -q "^LABEL=$LABEL " "$FSTAB" || echo "LABEL=$LABEL $MOUNTPOINT ext4 defaults,nofail 0 2" >>"$FSTAB"
grep -qs " $MOUNTPOINT " /proc/mounts || mount "$MOUNTPOINT"

# Bind-mount sources used by compose.aws.yaml (docker refuses a missing source); the test checks this list against that file.
mkdir -p "$MOUNTPOINT/db" "$MOUNTPOINT/caddy"
