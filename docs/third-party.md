# Third-party attribution

This project is MIT-licensed. Dependencies and external data sources have their
own terms. This file records redistribution notes for a public release.

## Runtime and development dependencies

Direct dependencies from `package.json` (transitive licenses are MIT/ISC/Apache-2.0
compatible for typical npm redistribution; re-check with `npm ls` before a legal
release if your counsel requires a full SBOM):

| Package | Role | License |
| --- | --- | --- |
| `jose` | Access JWT verification | MIT |
| `worker-mailer` | SMTP email from the Worker | MIT |
| `wrangler` | Cloudflare CLI / local runtime | MIT OR Apache-2.0 |
| `yaml` | Workflow policy parsing | ISC |
| `eslint` | Lint | MIT |
| `eslint-plugin-security` | Security lint rules | Apache-2.0 |
| `@commitlint/cli` | Conventional commit lint | MIT |
| `@commitlint/config-conventional` | Commitlint preset | MIT |
| `husky` | Git hooks | MIT |
| `lint-staged` | Pre-commit lint | MIT |

Regenerate a fuller inventory when needed:

```bash
npx license-checker --production --summary
```

## External data sources and APIs

| Source | Use in this project | Attribution / terms |
| --- | --- | --- |
| [Sunsethue API](https://sunsethue.com) | Sunrise/sunset quality forecasts | Subject to Sunsethue's API terms; an API key is required for production use and must not be committed |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | Geocoding for location search | Data © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/); respect the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) (valid User-Agent / contact, no heavy bulk scraping) |
| Google Fonts (Hanken Grotesk, Material Symbols) | Loaded at runtime via `fonts.googleapis.com` | Font files are served by Google; SIL Open Font License / Apache-2.0 as published by each family. No font binaries are vendored in this repository |

## Shipped assets audit

| Path | Description | Redistribution |
| --- | --- | --- |
| `public/index.html` | App shell | Original; MIT with the repository |
| `public/app.js` | Frontend logic | Original; MIT with the repository |
| `public/style.css` | Styles (references Google Fonts by URL only) | Original; MIT with the repository |
| `public/lib/helpers.js` | Shared frontend helpers | Original; MIT with the repository |
| `public/_routes.json` | Pages Functions routing | Original; MIT with the repository |
| `public/` favicon | Inline SVG data-URI emoji icon in `index.html` | Original; MIT with the repository |
| `docs/assets/forecast-dashboard.html` | Design/reference HTML mock | Original design artifact for docs; MIT with the repository |
| `docs/assets/forecast-dashboard.png` | Screenshot of the mock | Original screenshot; MIT with the repository |
| `docs/assets/stitch-streamlined-dashboard.html` | Alternate design reference | Original design artifact for docs; MIT with the repository |

No third-party image, icon pack, or font binary is vendored under `public/` or
`docs/assets/`. If you add such assets later, record them in this table with an
explicit license before publishing.
