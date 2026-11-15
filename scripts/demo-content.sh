#!/usr/bin/env bash
# Maintainer helper for the demo content fixture. Run by hand, rarely; not used in CI.
#   fetch   save the TheMealDB Italian meals (API output only) to $TMPDIR/ricettine-demo/raw/
#   photos  download every entry of photos.json to demo/images/ (width 1600 unless the entry
#           sets "width" to fit the 600 KB limit; fails over 600 KB)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
demo="$root/backend/src/main/resources/demo"
raw="${TMPDIR:-/tmp}/ricettine-demo/raw"
api="https://www.themealdb.com/api/json/v1/1"
max_bytes=$((600 * 1024))

fetch() {
	mkdir -p "$raw"
	curl -fsS "$api/filter.php?a=Italian" -o "$raw/filter.json"
	local ids id
	ids="$(jq -r '.meals[].idMeal' "$raw/filter.json")"
	for id in $ids; do
		curl -fsS "$api/lookup.php?i=$id" -o "$raw/meal-$id.json"
		echo "saved meal $id"
	done
	echo "raw output in $raw"
}

photos() {
	mkdir -p "$demo/images"
	local key file url width size
	while IFS=$'\t' read -r key file url width; do
		case "$url" in
		*images.unsplash.com*) url="${url%%\?*}?w=$width&q=80" ;;
		*images.pexels.com*) url="${url%%\?*}?auto=compress&w=$width" ;;
		*) echo "unsupported photo host for $key: $url" >&2; exit 1 ;;
		esac
		curl -fsSL "$url" -o "$demo/images/$file"
		size="$(wc -c <"$demo/images/$file" | tr -d ' ')"
		if [ "$size" -gt "$max_bytes" ]; then
			echo "$file is $size bytes, over the $max_bytes limit" >&2
			exit 1
		fi
		echo "$key -> images/$file ($size bytes)"
	done < <(jq -r 'to_entries[] | [.key, .value.file, .value.downloadUrl, (.value.width // 1600)] | @tsv' "$demo/photos.json")
}

case "${1:-}" in
fetch) fetch ;;
photos) photos ;;
*) echo "usage: $0 fetch|photos" >&2; exit 2 ;;
esac
