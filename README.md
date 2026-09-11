# timdev-r.github.io

Personal portfolio — **https://timdev-r.github.io**

Plain HTML, CSS and a little vanilla JavaScript. No framework, no build step,
no dependencies. Edit the files and push; GitHub Pages redeploys in about a minute.

```
index.html        all content lives here
assets/style.css  all styling
assets/main.js    scroll reveals, nav highlighting (site works without it)
.nojekyll         tells Pages to serve the files as-is
```

## Local preview

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

## Editing

Content is hand-written in `index.html` — each section is marked with a comment
banner (`HERO`, `WORK`, `PROJECTS`, `SKILLS`, `EDUCATION`, `CONTACT`).
To add a project, copy an existing `<a class="card reveal">` block and change
the href, title and text.

Colours are CSS custom properties at the top of `assets/style.css`; changing
`--accent` restyles the whole site.
