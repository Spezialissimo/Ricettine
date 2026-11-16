#!/usr/bin/env bash
# Checks the project docs (README.md and docs/*.md, not docs/superpowers/**):
#   1. every ```mermaid block renders (minlag/mermaid-cli in Docker, pinned);
#   2. every relative Markdown link and image target exists (http(s), mailto and pure #anchors are ignored;
#      for path#anchor only the path is checked).
# DOCS_CHECK_ROOT (default: the repository root) is the directory to check; it must be under a path Docker can mount.
set -euo pipefail

MERMAID_IMAGE="minlag/mermaid-cli:11.17.1"

ROOT="${DOCS_CHECK_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# find instead of globstar: macOS ships bash 3.2
files=()
[ ! -f README.md ] || files+=(README.md)
while IFS= read -r f; do files+=("$f"); done < <(find docs -maxdepth 1 -name '*.md' -type f 2>/dev/null | sort)
if [ "${#files[@]}" -eq 0 ]; then
  echo "docs-check: no Markdown files under $ROOT" >&2
  exit 1
fi

# inside ROOT, not $TMPDIR: Docker on macOS (Colima) only mounts the home directory
work="$(mktemp -d "$ROOT/.docs-check.XXXXXX")"
trap 'rm -rf "$work"' EXIT
# the mermaid image runs as a non-root user that must be able to write next to the inputs
chmod 777 "$work"

failures=0
fail() {
  echo "docs-check: $*" >&2
  failures=$((failures + 1))
}

# --- Mermaid: split every ```mermaid block into $work/<n>.mmd, remembering where it came from
echo "mermaid blocks..."
count=0
for f in "${files[@]}"; do
  start="$count"
  # awk prints "<n> <line>" for each block start; the blocks themselves go to $work/<n>.mmd
  while IFS= read -r line; do
    count=$((count + 1))
    echo "$f:$line" >"$work/$count.src"
  done < <(awk -v dir="$work" -v start="$start" '
    /^[[:space:]]*```mermaid[[:space:]]*$/ && !inblock { inblock = 1; n++; out = dir "/" (start + n) ".mmd"; first = NR; printf "" > out; next }
    /^[[:space:]]*```[[:space:]]*$/ && inblock { inblock = 0; close(out); print first; next }
    inblock { print >> out }
    END { if (inblock) { print "unterminated mermaid block starting at line " first > "/dev/stderr"; exit 1 } }
  ' "$f")
done

i=1
while [ "$i" -le "$count" ]; do
  src="$(cat "$work/$i.src")"
  if ! out="$(docker run --rm -v "$work":/data "$MERMAID_IMAGE" -i "/data/$i.mmd" -o "/data/$i.svg" 2>&1)"; then
    fail "mermaid block at ${src%:*} line ${src##*:} does not render:"
    printf '    %s\n' "$(printf '%s\n' "$out" | head -n 6)" >&2
  fi
  i=$((i + 1))
done
echo "  $count block(s) rendered"

# --- Links: [text](target) and ![alt](target) outside code fences and inline code
echo "relative links..."
# shellcheck disable=SC2016 # the backticks are a literal sed pattern, not a command substitution
inline_code='s/`[^`]*`//g'
checked=0
for f in "${files[@]}"; do
  dir="$(dirname "$f")"
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    target="${target#<}"
    target="${target%%>*}"
    target="${target%% *}"
    case "$target" in
      http://* | https://* | mailto:* | '#'* | '') continue ;;
    esac
    path="${target%%#*}"
    path="${path%%\?*}"
    [ -n "$path" ] || continue
    case "$path" in
      /*) resolved="$ROOT$path" ;;
      *) resolved="$dir/$path" ;;
    esac
    checked=$((checked + 1))
    [ -e "$resolved" ] || fail "$f links to a missing target: $target"
  done < <(awk '/^[[:space:]]*```/ { infence = !infence; next } !infence { print }' "$f" \
    | sed "$inline_code" | grep -oE '\]\([^)]*\)' | sed -e 's/^](//' -e 's/)$//' || true)
done
echo "  $checked link(s) checked"

if [ "$failures" -ne 0 ]; then
  echo "DOCS CHECK FAILED ($failures problem(s))" >&2
  exit 1
fi
echo "DOCS CHECK OK"
