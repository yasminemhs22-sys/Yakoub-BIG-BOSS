# Fonts

Fonts are **self-hosted**. No Google Fonts CDN, no external requests (D-199,
D-210).

I have no network access, so I cannot download these for you. Four files are
needed in `public/fonts/`.

## What to download

| File to create | Font | Where |
|---|---|---|
| `anton-latin.woff2` | Anton, 400 | fonts.google.com/specimen/Anton |
| `inter-latin.woff2` | Inter, variable 100–900 | fonts.google.com/specimen/Inter |
| `cairo-arabic.woff2` | Cairo, variable 200–1000 | fonts.google.com/specimen/Cairo |
| `plex-arabic.woff2` | IBM Plex Sans Arabic, 100–700 | fonts.google.com/specimen/IBM+Plex+Sans+Arabic |

All four are open licence (SIL OFL), so bundling them is permitted.

## Easiest route

**google-webfonts-helper** (`gwfh.mranftl.com`) gives you `.woff2` files
directly, without the CSS wrapper Google normally serves.

1. Search the font
2. Select **latin** for Anton and Inter, **arabic** for Cairo and IBM Plex Sans
   Arabic
3. Download, unzip, rename to the filenames above, drop into `public/fonts/`

## Why the split matters

`src/styles/global.css` declares a `unicode-range` on each face. The browser
downloads the Arabic files **only when Arabic characters actually appear**.

A French visitor never downloads Cairo or Plex Arabic. On a 3G connection that
is roughly 200–300 KB they do not pay for — which is the difference between a
fast page and a slow one for half your audience.

If you subset the files yourself, keep the ranges aligned with the CSS.

## Until you add them

The site still works. `font-display: swap` and the `system-ui` fallback in
`tailwind.config.ts` mean text renders immediately in a system font. It will
look plainer than intended, not broken.

## Verifying

After `npm run dev`, open DevTools → Network → Font:

- On `/fr` — only `anton-latin` and `inter-latin` should load
- On `/ar` — `cairo-arabic` and `plex-arabic` should load as well

If the Arabic fonts load on the French page, a `unicode-range` is wrong.
