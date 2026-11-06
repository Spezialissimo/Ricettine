#!/usr/bin/env bash
# Tests mount-data.sh with PATH-stubbed blkid, mkfs.ext4, mount and e2label that record their calls.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/mount-data.sh"
FAILED=0

# check DESCRIPTION COMMAND...: passes when the command succeeds
check() {
  local description="$1"
  shift
  if "$@"; then echo "ok   $description"; else echo "FAIL $description"; FAILED=1; fi
}
not() { ! "$@" >/dev/null 2>&1; }
calls_count() { grep -c "^$1" "$T/calls"; }
mkfs_once() { [ "$(calls_count mkfs.ext4)" -eq 1 ]; }
fstab_once() { [ "$(grep -c '^LABEL=ricettine-data ' "$T/fstab")" -eq 1 ]; }

# new_env FS_TYPE: build a sandbox with stubs; blkid prints FS_TYPE (empty = no filesystem)
new_env() {
  T="$(mktemp -d)"
  mkdir -p "$T/bin"
  : >"$T/calls"; : >"$T/fstab"; : >"$T/device"
  printf '%s' "$1" >"$T/fstype"
  cat >"$T/bin/blkid" <<'STUB'
#!/usr/bin/env bash
echo "blkid $*" >>"$SANDBOX/calls"
fs="$(cat "$SANDBOX/fstype")"
[ "$fs" != "__ERROR__" ] || exit 1 # a real blkid failure (not "no filesystem")
[ -n "$fs" ] || exit 2
echo "$fs"
STUB
  for tool in mkfs.ext4 mount e2label; do
    # shellcheck disable=SC2016 # the stub must expand $* and $SANDBOX when it runs, not now
    printf '#!/usr/bin/env bash\necho "%s $*" >>"$SANDBOX/calls"\n' "$tool" >"$T/bin/$tool"
  done
  chmod +x "$T"/bin/*
}

# run [VAR=value...]: runs the script in the sandbox; prints its output when it fails
run() {
  env SANDBOX="$T" PATH="$T/bin:$PATH" DEVICE="$T/device" MOUNTPOINT="$T/mnt" FSTAB="$T/fstab" \
    BYID_DIR="$T/by-id" WAIT_TRIES=1 WAIT_SECONDS=0 "$@" bash "$SCRIPT" >"$T/out" 2>&1 || { cat "$T/out"; return 1; }
}
# bind sources that compose.aws.yaml needs: every ${RICETTINE_DATA_DIR:-...}/<name> must be created
compose_dirs_exist() {
  local name found=0
  # shellcheck disable=SC2016 # the ${...} is literal text in compose.aws.yaml
  while IFS= read -r name; do
    found=1
    [ -d "$T/mnt/$name" ] || { echo "missing $T/mnt/$name" >&2; return 1; }
  done < <(sed -n 's|.*device: \${RICETTINE_DATA_DIR:-/srv/ricettine}/\([a-z-]*\).*|\1|p' "$HERE/../../compose.aws.yaml")
  [ "$found" -eq 1 ]
}
no_mkfs() { ! grep -q '^mkfs.ext4' "$T/calls"; }

# 1. existing filesystem: never formatted
new_env ext4
check "runs with an existing filesystem" run
check "existing filesystem: mkfs is never called" no_mkfs

# 2. blank volume: formatted exactly once, with the label
new_env ""
check "runs on a blank volume" run
check "blank volume: mkfs called once" mkfs_once
check "blank volume: mkfs uses -L ricettine-data" grep -q -- '^mkfs.ext4 .*-L ricettine-data' "$T/calls"

# 3. idempotent: twice leaves one fstab line, nofail, by LABEL
check "second run succeeds" run
check "fstab line appears once after two runs" fstab_once
check "fstab line has nofail" grep -q nofail "$T/fstab"
check "creates db and every other bind source of compose.aws.yaml" compose_dirs_exist
check "creates the db subdirectory" test -d "$T/mnt/db"
check "creates the caddy subdirectory" test -d "$T/mnt/caddy"

# 4. blkid fails for a reason other than "no filesystem": never format, exit non-zero
new_env "__ERROR__"
check "blkid error: script exits non-zero" not run
check "blkid error: mkfs is never called" no_mkfs

# 5. device never appears: exit non-zero, never format
new_env ext4
check "missing device: script exits non-zero" not run DEVICE="$T/nope"
check "missing device: mkfs is never called" no_mkfs

# 6. fallback by volume id (NVMe by-id path)
new_env ext4
mkdir -p "$T/by-id"
: >"$T/by-id/nvme-Amazon_Elastic_Block_Store_vol0123456789abcdef0"
check "falls back to /dev/disk/by-id with VOLUME_ID" run DEVICE="$T/nope" VOLUME_ID=vol-0123456789abcdef0
check "by-id fallback: blkid ran on the by-id path" grep -q 'blkid .*by-id/nvme-Amazon_Elastic_Block_Store_vol0123456789abcdef0' "$T/calls"

if [ "$FAILED" -ne 0 ]; then echo "MOUNT-DATA TEST FAILED"; exit 1; fi
echo "MOUNT-DATA TEST OK"
