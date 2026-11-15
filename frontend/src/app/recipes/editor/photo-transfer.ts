/**
 * Reading photos out of a drag or a paste, the same way in every browser. A drag reports only its `types`
 * until the drop; at the drop (and in a paste) the files may be in `files` or only in `items` (Safari and
 * some sources such as the macOS Photos app fill one but not the other).
 */

/** Files are being dragged (Finder, Photos, desktop): `types` names them during the whole drag. */
export function carriesFiles(dt: DataTransfer | null | undefined): boolean {
  return Array.from(dt?.types ?? []).includes('Files');
}

/**
 * Something dragged out of a web page (an image, a link): an address or page markup, but no file. Whether
 * it holds an image is only known at the drop, when the data can be read.
 */
export function carriesLinkOnly(dt: DataTransfer | null | undefined): boolean {
  const types = Array.from(dt?.types ?? []);
  return (
    !types.includes('Files') && (types.includes('text/uri-list') || types.includes('text/html'))
  );
}

/** A text field (or inside one): there, a dragged link or page text is meant as text. */
export const isTextField = (t: EventTarget | null): boolean =>
  !!(t as Element | null)?.closest?.('input, textarea, [contenteditable]');

/** Text in a paste (beside any image): the text an office app puts next to its picture of it. */
export function carriesText(dt: DataTransfer | null | undefined): boolean {
  if (!Array.from(dt?.types ?? []).includes('text/plain')) return false;
  return (dt?.getData('text/plain') ?? '').trim() !== '';
}

/** The files in a drop or paste: `files` first, else the file entries of `items`. */
export function transferFiles(dt: DataTransfer | null | undefined): File[] {
  const files = Array.from(dt?.files ?? []);
  if (files.length) return files;
  return Array.from(dt?.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
}

/**
 * The image address in a drag from a web page: the dragged `<img>` in `text/html` first (when the image is
 * wrapped in a link, `text/uri-list` names the link's page, not the image), else the first `text/uri-list`
 * entry. `DOMParser` documents are inert: nothing in them loads or runs.
 */
export function draggedImageUrl(dt: DataTransfer | null | undefined): string | null {
  const img = draggedImgSrc(dt);
  if (img) return img;
  const list = (dt?.getData('text/uri-list') ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  return list || null;
}

/** The `src` of an `<img>` in the dragged page markup, if the drag holds an image at all. */
export function draggedImgSrc(dt: DataTransfer | null | undefined): string | null {
  const html = dt?.getData('text/html') ?? '';
  if (!html) return null;
  const src = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('img[src]')
    ?.getAttribute('src');
  return src?.trim() || null;
}

/** A `data:image/...;base64,` address (search-result thumbnails) as a file, read here without a request. */
export function dataUrlToFile(url: string): File | null {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url);
  if (!m) return null;
  try {
    const bytes = Uint8Array.from(atob(m[2].replace(/\s/g, '')), (c) => c.charCodeAt(0));
    return new File([bytes], 'dropped-image', { type: m[1].toLowerCase() });
  } catch {
    return null;
  }
}

/** Only plain web addresses go to the server (it refuses anything else too). */
export const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url);
