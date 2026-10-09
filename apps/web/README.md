# @vampless/web

Public site for Vampless: protocol overview, live in-browser demo, explorer, and spec.

```bash
npm run build -w @vampless/core   # the site imports the built core
npm run dev -w @vampless/web      # http://localhost:3000
```

Routes: `/` (overview), `/demo` (two launchpads, one registry — runs `@vampless/core` in the browser), `/explorer` (mint resolution + provenance labels), `/spec` (protocol reference).

Deploys anywhere Next.js 16 runs; `npm run build` produces fully static routes.
