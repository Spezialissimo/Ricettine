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
not() { ! "$@"; }
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
[ -n "$fs" ] || exit 2
echo "$fs"
STUB
  for tool in mkfs.ext4 mount e2label; do
    # shellcheck disable=SC2016 # the stub must expand $* and $SANDBOX when it runs, not now
    printf '#!/usr/bin/env bash\necho "%s $*" >>"$SANDBOX/calls"\n' "$tool" >"$T/bin/$tool"
  done
  chmod +x "$T"/bin/*
}

run() {
  SANDBOX="$T" PATH="$T/bin:$PATH" DEVICE="$T/device" MOUNTPOINT="$T/mnt" FSTAB="$T/fstab" \
    WAIT_TRIES=1 bash "$SCRIPT" >"$T/out" 2>&1 || { cat "$T/out"; return 1; }
}

# 1. existing filesystem: never formatted
new_env ext4
check "runs with an existing filesystem" run
check "existing filesystem: mkfs is never called" not grep -q '^mkfs.ext4' "$T/calls"

# 2. blank volume: formatted exactly once, with the label
new_env ""
check "runs on a blank volume" run
check "blank volume: mkfs called once" mkfs_once
check "blank volume: mkfs uses -L ricettine-data" grep -q -- '^mkfs.ext4 .*-L ricettine-data' "$T/calls"

# 3. idempotent: twice leaves one fstab line, nofail, by LABEL
check "second run succeeds" run
check "fstab line appears once after two runs" fstab_once
check "fstab line has nofail" grep -q nofail "$T/fstab"
check "creates the db subdirectory" test -d "$T/mnt/db"

if [ "$FAILED" -ne 0 ]; then echo "MOUNT-DATA TEST FAILED"; exit 1; fi
echo "MOUNT-DATA TEST OK"
