#!/usr/bin/env bash
# Maintainer helper for the demo content fixture. Run by hand, rarely; not used in CI.
#   fetch   save the TheMealDB Italian meals (API output only) to $TMPDIR/ricettine-demo/raw/
#   photos [key...]  download the entries of photos.json (all, or only the given keys) to
#           demo/images/ (width 1600 unless the entry sets "width" to fit the 600 KB limit; fails
#           over 600 KB). Wikimedia Commons entries use the /thumb/ form at "width" (default 960);
#           "width": 0 keeps the original file (needed when the original is narrower than 960 px).
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

commons_url() {
	# https://upload.wikimedia.org/wikipedia/commons/a/ab/Name.jpg -> .../commons/thumb/a/ab/Name.jpg/<width>px-Name.jpg
	local url="$1" width="$2" rest name
	rest="${url#https://upload.wikimedia.org/wikipedia/commons/}"
	name="${rest##*/}"
	echo "https://upload.wikimedia.org/wikipedia/commons/thumb/$rest/${width}px-$name"
}

photos() {
	mkdir -p "$demo/images"
	local key file url width size wanted=" $* " attempt
	while IFS=$'\t' read -r key file url width; do
		if [ "$#" -gt 0 ] && [[ "$wanted" != *" $key "* ]]; then
			continue
		fi
		case "$url" in
		*images.unsplash.com*) url="${url%%\?*}?w=$width&q=80" ;;
		*images.pexels.com*) url="${url%%\?*}?auto=compress&w=$width" ;;
		*upload.wikimedia.org*)
			if [ "$width" = "1600" ]; then width=960; fi
			if [ "$width" != "0" ]; then url="$(commons_url "$url" "$width")"; fi
			;;
		*) echo "unsupported photo host for $key: $url" >&2; exit 1 ;;
		esac
		# Commons rate-limits automated clients: identify ourselves, pause, and retry on 429.
		for attempt in 1 2 3 4 5 6; do
			if curl -fsSL -A "ricettine-demo-content/1.0" "$url" -o "$demo/images/$file"; then
				break
			fi
			if [ "$attempt" = 6 ]; then
				echo "download of $key failed: $url" >&2
				exit 1
			fi
			sleep $((attempt * 5))
		done
		sleep 1
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
photos) shift; photos "$@" ;;
*) echo "usage: $0 fetch|photos [key...]" >&2; exit 2 ;;
esac
