# Fonts

One typeface, Geist Sans, for everything: body, headings and figures. No display
or monospace family. Where figures have to line up, `tabular-nums` does that job.

`Geist-Variable.woff2` is the single variable file, weights 100-900. It is
committed rather than resolved from the `geist` npm package, because that
package's only exports are Next.js `next/font` wrappers -- it does not export
its font files, so a Vite `url()` cannot reach them.

To update: take `dist/fonts/geist-sans/Geist-Variable.woff2` from the `geist`
package (1.7.2 at the time of writing) and replace the file. Nothing else
references it but `@font-face` in `src/index.css`.

`OFL.txt` is the SIL Open Font Licence, which requires the licence to travel
with the font.
