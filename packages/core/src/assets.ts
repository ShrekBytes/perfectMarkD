// ─────────────────────────────────────────────────────────────────────────────
// Asset resolution seam.
//
// The engine never touches the filesystem: markdown image refs and banner /
// background asset refs arrive here as opaque strings, and the host app
// supplies the resolver that maps a ref to something renderable. In the browser
// that means data: (pasted/embedded), blob: (picked from disk), or https:
// (remote) URLs; a server-side renderer could map refs to disk paths instead.
// ─────────────────────────────────────────────────────────────────────────────

/** Turns an asset ref (markdown image path, banner/background ref) into a URL
 *  the current environment can render. Returns undefined when the ref can't be
 *  resolved; renderers decide how to handle unresolvable assets (skip the
 *  image, fall back to alt text, …). Replaces the plugin's Obsidian-bound
 *  resolveImageUrl. */
export type AssetResolver = (ref: string) => string | undefined;
