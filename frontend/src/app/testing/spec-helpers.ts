/** Shared DOM and fixture helpers for specs. */

/** Lets pending HTTP continuations (microtasks) run, then waits for rendering to settle. */
export async function settle(f: { whenStable(): Promise<unknown> }): Promise<void> {
  await f.whenStable();
  await new Promise((r) => setTimeout(r));
  await f.whenStable();
}

/** The button (or, with `selector`, element) whose trimmed text or aria-label is `text`. */
export const btn = (root: ParentNode, text: string, selector = 'button') =>
  Array.from(root.querySelectorAll<HTMLElement>(selector)).find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text);

/** The CDK overlay container, where dialogs and sheets render. */
export const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;

/** For `afterEach`: dialogs outlive a TestBed, so empty the overlay container between specs. */
export const clearOverlays = () => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));

/** A cookbook member/author fixture. */
export const person = (n: string, id?: string) => ({ ...(id ? { id } : {}), username: n, displayName: n.toUpperCase(), avatarUrl: null });

/** Types `value` into the input matching `selector`, the way a user would (an `input` event). */
export function typeInto(root: ParentNode, selector: string, value: string): void {
  const i = root.querySelector(selector) as HTMLInputElement;
  i.value = value;
  i.dispatchEvent(new Event('input'));
}

/** Submits the form inside `root`. */
export const submitForm = (root: ParentNode) => root.querySelector('form')!.dispatchEvent(new Event('submit'));

/** Fills `input[name=key]` for each entry, then submits the form. */
export function fillForm(root: ParentNode, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) typeInto(root, `input[name=${name}]`, value);
  submitForm(root);
}

/** A promise settled from outside, for holding a request open. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
