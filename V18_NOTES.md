# TYSHI ZONE v18.0.1

## Visual updates
- Removed the page-wide dark header fade. The dark translucent treatment is confined to the search field itself, so artwork remains clear around it.
- Kept the search field slightly shorter and pill-shaped, with no outer shadow.
- Reworked the watch page season panel to use a clean dark surface without the pale glass frame. Season tiles are square; the open season is brightest and accented, while other artwork stays visible but subdued. Season labels are larger and more legible, and the `Current` badge is removed.
- Removed the yellow same-link notice from the watch page.

## Performance updates
- Spotlight changes retain a fade animation but no longer blur the full-screen artwork during transitions. Pointer-driven drag updates are frame-limited.
- Home sections below the fold mount and fetch data as they approach the viewport, reducing startup work and simultaneous requests.
- Reduced desktop glass-panel blur. The existing mobile rule that disables backdrop filters remains.

## Player protections
The iframe sandbox and ad-shield behavior are unchanged. If an external player such as Vidrift refuses to play while sandboxed, a compatible safe player URL or integration is still required. The removed notice indicated SUB and DUB share one saved link; audio switching still requires a separate DUB link.

## Install and run
From the extracted project folder containing `package.json`:

```sh
npm install
npm run dev
```

Create a production build with `npm run build`.
