# Changelog

All notable changes to this project are documented in this file.

This changelog follows [Conventional Commits](https://www.conventionalcommits.org/) and is maintained by [release-please](https://github.com/googleapis/release-please). Release sections group changes by commit type (`feat`, `fix`, etc.). Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.23.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.22.1...v1.23.0) (2026-08-08)


### Features

* **scheduler:** add per-location custom check times ([#99](https://github.com/andrewtryder/sunsethue-helper/issues/99)) ([0670e0a](https://github.com/andrewtryder/sunsethue-helper/commit/0670e0a2c6b53f8e588611b2099c3ddec9e615fc))


### Bug Fixes

* **ci:** remove observability from Pages wrangler template ([#94](https://github.com/andrewtryder/sunsethue-helper/issues/94)) ([ef44f8a](https://github.com/andrewtryder/sunsethue-helper/commit/ef44f8a6843b90d60ec4d8bcd47aab6a7c428cd9))
* **demo:** static GitHub Pages demo under subpath ([#92](https://github.com/andrewtryder/sunsethue-helper/issues/92)) ([9283118](https://github.com/andrewtryder/sunsethue-helper/commit/9283118130f76fd0582a6505b4b4960422bbb7e7))
* **frontend:** consolidate settings notification channels ([#97](https://github.com/andrewtryder/sunsethue-helper/issues/97)) ([461ac9e](https://github.com/andrewtryder/sunsethue-helper/commit/461ac9edd767af37f226c084f169601370ec6208))
* **frontend:** decouple app startup from optional notification services ([#93](https://github.com/andrewtryder/sunsethue-helper/issues/93)) ([efbb81c](https://github.com/andrewtryder/sunsethue-helper/commit/efbb81c52160db1e072328ae3b01c93f5b71f84f))
* **frontend:** isolate optional browser notification module failures ([#96](https://github.com/andrewtryder/sunsethue-helper/issues/96)) ([6805548](https://github.com/andrewtryder/sunsethue-helper/commit/680554854611863eb72e2d0e7e8a4f46fcf2b9f9))
* **frontend:** unify schedule times with location thresholds ([#98](https://github.com/andrewtryder/sunsethue-helper/issues/98)) ([32ecde3](https://github.com/andrewtryder/sunsethue-helper/commit/32ecde3d3db6807f15862a9a4566f171047b7900))

## [1.22.1](https://github.com/andrewtryder/sunsethue-helper/compare/v1.22.0...v1.22.1) (2026-08-07)


### Bug Fixes

* **frontend:** move api-client to lib to prevent worker interception ([#90](https://github.com/andrewtryder/sunsethue-helper/issues/90)) ([7c769d9](https://github.com/andrewtryder/sunsethue-helper/commit/7c769d92bd30c70f6fa1ff0cdae273b4297e45c0))
* **notifications:** include quality and timezone in compact push content ([#88](https://github.com/andrewtryder/sunsethue-helper/issues/88)) ([dd11e83](https://github.com/andrewtryder/sunsethue-helper/commit/dd11e833b1a0daac968a2bb8d7be21b8c1b5f157))

## [1.22.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.21.0...v1.22.0) (2026-08-07)


### Features

* **notifications:** add health, self-test, clear history, and adoption CLIs ([#71](https://github.com/andrewtryder/sunsethue-helper/issues/71)) ([43af9f7](https://github.com/andrewtryder/sunsethue-helper/commit/43af9f7b2d49dbde1e79ea70d8c230ae4beb1508))
* **notifications:** add scheduling, thresholds, web push, and webhook ([#70](https://github.com/andrewtryder/sunsethue-helper/issues/70)) ([4343d39](https://github.com/andrewtryder/sunsethue-helper/commit/4343d39d16019528ce87f0bf8457b359f2cdaaab))
* prepare for next release (timezone, logging, cleanup) ([#83](https://github.com/andrewtryder/sunsethue-helper/issues/83)) ([2427231](https://github.com/andrewtryder/sunsethue-helper/commit/242723167b6430e10db45019faac9fd835306189))
* **worker:** redact notification secrets from logs ([#82](https://github.com/andrewtryder/sunsethue-helper/issues/82)) ([8b2b021](https://github.com/andrewtryder/sunsethue-helper/commit/8b2b021ca6f2de89da9ce21ee29760b2d33cf524))


### Bug Fixes

* **ci:** pin wrangler to exact version ([#79](https://github.com/andrewtryder/sunsethue-helper/issues/79)) ([0d2fc6b](https://github.com/andrewtryder/sunsethue-helper/commit/0d2fc6b61104d36f6095936c302bd382e7659072))
* **scripts:** remove leading sql comment in db-upgrade-r2 ([#80](https://github.com/andrewtryder/sunsethue-helper/issues/80)) ([ad9510f](https://github.com/andrewtryder/sunsethue-helper/commit/ad9510fe303c0309fb5f6614da35de73dac5ccc9))
* **scripts:** remove leading sql comment in db-upgrade-r2 to fix yargs parsing ([ad9510f](https://github.com/andrewtryder/sunsethue-helper/commit/ad9510fe303c0309fb5f6614da35de73dac5ccc9))
* **secrets:** add missing secrets to bootstrap specs ([#85](https://github.com/andrewtryder/sunsethue-helper/issues/85)) ([59ef91c](https://github.com/andrewtryder/sunsethue-helper/commit/59ef91c43c86919e4632a585d5175b3e70ba4ad0))
* **test:** update expected pushover error code ([#84](https://github.com/andrewtryder/sunsethue-helper/issues/84)) ([1e63637](https://github.com/andrewtryder/sunsethue-helper/commit/1e63637b18c90ca929ca1fc7323cc3d42a90565e))
* **worker:** preserve notification error cause for logging ([#81](https://github.com/andrewtryder/sunsethue-helper/issues/81)) ([1bf303a](https://github.com/andrewtryder/sunsethue-helper/commit/1bf303a143525b2022a7e120e78f6f2855f05ab2))

## [1.21.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.20.0...v1.21.0) (2026-08-01)


### Features

* **frontend:** make logo navigate to forecast home ([#67](https://github.com/andrewtryder/sunsethue-helper/issues/67)) ([56257fe](https://github.com/andrewtryder/sunsethue-helper/commit/56257fe62d5f9f4eaee02cfd32267946d8bc916c))

## [1.20.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.19.0...v1.20.0) (2026-08-01)


### Features

* **frontend:** polish forecast, locations, activity, and settings layouts ([#64](https://github.com/andrewtryder/sunsethue-helper/issues/64)) ([46cef7d](https://github.com/andrewtryder/sunsethue-helper/commit/46cef7dd3d5661342d81995512910426f0e50f4c))

## [1.19.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.18.1...v1.19.0) (2026-08-01)


### Features

* **ops:** add status endpoint, CSP headers, and Playwright ([#62](https://github.com/andrewtryder/sunsethue-helper/issues/62)) ([f2039ca](https://github.com/andrewtryder/sunsethue-helper/commit/f2039ca))
* **credentials:** require Secrets Store for provider delivery ([#60](https://github.com/andrewtryder/sunsethue-helper/issues/60)) ([5ee67ae](https://github.com/andrewtryder/sunsethue-helper/commit/5ee67ae4aaf0a75e610d1872c1ccd752788007c2))

## [1.18.1](https://github.com/andrewtryder/sunsethue-helper/compare/v1.18.0...v1.18.1) (2026-08-01)


### Bug Fixes

* **frontend:** tighten Horizon gear, quality row, and forecast columns ([a253ffd](https://github.com/andrewtryder/sunsethue-helper/commit/a253ffd2aaa8c8b71c319a1d1fef7a26833657d0))

## [1.18.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.17.0...v1.18.0) (2026-07-31)


### Features

* add configurable notification outbox ([4802669](https://github.com/andrewtryder/sunsethue-helper/commit/4802669bbfb23d4df61f84cb041f7c23f42800c7))
* **credentials:** add secrets store provider credential administration ([a6b8bfd](https://github.com/andrewtryder/sunsethue-helper/commit/a6b8bfdd0ba432720d806dceec3e53b76e1528bc))


### Bug Fixes

* **ci:** pass secrets store env to pages and verify jobs ([b71403d](https://github.com/andrewtryder/sunsethue-helper/commit/b71403dae4995c82178f2fd4748f0cf3663fdc83))
* **ci:** upload Worker secrets with worker config ([9ab746d](https://github.com/andrewtryder/sunsethue-helper/commit/9ab746d4f05fa1b6c3c916a1edde60fa2d64d606))
* **credentials:** accept spaced gmail app passwords and surface codes ([16db040](https://github.com/andrewtryder/sunsethue-helper/commit/16db040a0611ca110746c5a381dd6ca1835a6571))
* **credentials:** allow same-origin status GET without Origin ([a20f226](https://github.com/andrewtryder/sunsethue-helper/commit/a20f226f7bc4612350a751ce604a5b9611b648db))
* **notifications:** harden outbox and validate APIs ([498a3e8](https://github.com/andrewtryder/sunsethue-helper/commit/498a3e81de4a3e0b4d9a79bef063b2174eb8e53c))
* **test:** lowercase transport-schema email fixture for sanitizer ([5731f6b](https://github.com/andrewtryder/sunsethue-helper/commit/5731f6b83dd0dc055fedc01010833afb0046b9df))

## [1.17.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.16.0...v1.17.0) (2026-06-28)


### Features

* **ui:** add visual required indicators and client validation to form ([bd65cfb](https://github.com/andrewtryder/sunsethue-helper/commit/bd65cfbff63145d9530dc59eaffcc9ee848f18f1))


### Performance Improvements

* **format:** avoid new Date() allocations in Intl formatting ([1774742](https://github.com/andrewtryder/sunsethue-helper/commit/1774742fd12a884a6d2d579c220c1af021f8d199))

## [1.16.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.15.0...v1.16.0) (2026-06-27)


### Features

* **ui:** implement ARIA tab roles for accessibility ([b5027c1](https://github.com/andrewtryder/sunsethue-helper/commit/b5027c1c5a83e51d4efbac294e0b73cc7d2f19aa))


### Bug Fixes

* correct git filter-branch range syntax and variable reference in fix-commit-messages.sh ([eac1373](https://github.com/andrewtryder/sunsethue-helper/commit/eac1373f22a68811aee7f648f8c78100c5bba4e0))


### Performance Improvements

* **backend:** optimize selectNextSunEvents from O(n log n) to O(n) ([#34](https://github.com/andrewtryder/sunsethue-helper/issues/34)) ([2b49939](https://github.com/andrewtryder/sunsethue-helper/commit/2b49939aa205f366ce5de522e0f25d7ea4531101))
* **frontend:** batch DOM insertions with DocumentFragment ([d00add1](https://github.com/andrewtryder/sunsethue-helper/commit/d00add124828f865b79dd8818b6c79011a818c76))

## [1.15.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.14.0...v1.15.0) (2026-06-25)


### Features

* **a11y:** add aria-live to notification banners ([#30](https://github.com/andrewtryder/sunsethue-helper/issues/30)) ([e82d410](https://github.com/andrewtryder/sunsethue-helper/commit/e82d410c342f45808a4f3be7f9806eaecbeca07a))
* **ui:** add save button loading state and banner a11y roles ([#28](https://github.com/andrewtryder/sunsethue-helper/issues/28)) ([fdfd8d0](https://github.com/andrewtryder/sunsethue-helper/commit/fdfd8d07db2ab04c4f061735081b73e52c528efc))


### Performance Improvements

* **backend:** cache Intl.DateTimeFormat instances ([#29](https://github.com/andrewtryder/sunsethue-helper/issues/29)) ([4887117](https://github.com/andrewtryder/sunsethue-helper/commit/4887117349c7f4affd2222798405d18fe712e9a3))
* **worker:** cache Intl.DateTimeFormat instances ([#31](https://github.com/andrewtryder/sunsethue-helper/issues/31)) ([0ae09cb](https://github.com/andrewtryder/sunsethue-helper/commit/0ae09cb12fa298f24a2e811beab6bd6c4f00960b))

## [1.14.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.13.0...v1.14.0) (2026-06-22)


### Features

* apply Stitch Twilight Glass design system to frontend ([2d44a41](https://github.com/andrewtryder/sunsethue-helper/commit/2d44a41f40b984c0d1fff16d7396fbc6b1f5834c))
* **cf:** migrate from firebase to cloudflare ([13fd9f3](https://github.com/andrewtryder/sunsethue-helper/commit/13fd9f3fc631613b71f89e39e33e99edffbe4f01))
* **ci:** add tests, CI pipeline, and quality normalization ([559285e](https://github.com/andrewtryder/sunsethue-helper/commit/559285e089ab9adab15fe79b3923ee26eb66c090))
* **email:** remove times and style quality badge background ([1fd78ec](https://github.com/andrewtryder/sunsethue-helper/commit/1fd78ecc6ab8d685d9b23413cb155f7c5862e7d7))
* **repo:** resolve code review findings and support usage endpoint ([3f7463c](https://github.com/andrewtryder/sunsethue-helper/commit/3f7463c0796931f402d875bc793b8587f0aff766))
* **report:** add 12:00 pm scheduled report email ([239ec53](https://github.com/andrewtryder/sunsethue-helper/commit/239ec53dc5c874506450cf4f2d1a00a5b5ef113a))
* **report:** add webapp dashboard link to automated report emails ([e43f8e8](https://github.com/andrewtryder/sunsethue-helper/commit/e43f8e8b859f74b50d7365baf30ba88a20949efa))
* **ui:** add email success modal and mobile-friendly reports ([b8917f4](https://github.com/andrewtryder/sunsethue-helper/commit/b8917f4b8327f5e8fa5c870e961103bbb07f21c5))
* **ui:** fix email modal, table email layout, and preview command ([a9505c3](https://github.com/andrewtryder/sunsethue-helper/commit/a9505c334dde8ebc4f0e131876850e39a84286a3))
* **ui:** improve screen reader accessibility for icon buttons ([#22](https://github.com/andrewtryder/sunsethue-helper/issues/22)) ([036ac36](https://github.com/andrewtryder/sunsethue-helper/commit/036ac3652d4f3be590b523fdc418bda5377309c4))
* **ui:** obsidian flux redesign for frontend and email ([d3ee12d](https://github.com/andrewtryder/sunsethue-helper/commit/d3ee12d9469afae7329240445f995e35f86eb396))
* **ui:** polish email modal and show api credits on logs ([bb8ab93](https://github.com/andrewtryder/sunsethue-helper/commit/bb8ab936ef12b98c49b5bb6e96a4db39c827726a))


### Bug Fixes

* **api:** trim SUNSETHUE_API_KEY to handle trailing newlines ([7815556](https://github.com/andrewtryder/sunsethue-helper/commit/781555655302077ff6f542388b829b80b6a4ac31))
* **auth:** trim and ignore case of authorized email addresses ([8f3ebed](https://github.com/andrewtryder/sunsethue-helper/commit/8f3ebed1a0cc93e4e9fc8ca3374f24bb0ae516db))
* **ci:** require Java 21 for Firebase emulator E2E job ([e9d0df5](https://github.com/andrewtryder/sunsethue-helper/commit/e9d0df55735c00956574a1a5e8fbfeeaa2fb39fb))
* **ci:** solve audit vulnerabilities and force node 24 ([1b95e6f](https://github.com/andrewtryder/sunsethue-helper/commit/1b95e6f36621763860f790d95969e37b86b5b4b4))
* **e2e:** fetch authorized email dynamically on startup ([e86ac3c](https://github.com/andrewtryder/sunsethue-helper/commit/e86ac3cd6b51aed4ad720867caf8926c8210e0a3))
* **e2e:** robust email validation fallback and config fetch timeout ([59a2817](https://github.com/andrewtryder/sunsethue-helper/commit/59a281748fcb92838ea47169e4a86ceb32608300))
* **e2e:** stabilize auth emulator login in CI ([a636fff](https://github.com/andrewtryder/sunsethue-helper/commit/a636fff7884396f7d4b2f8b02c894d3a6ad1e550))
* **e2e:** use demo project for offline emulator runs ([fb6e476](https://github.com/andrewtryder/sunsethue-helper/commit/fb6e476fab949726a569946bc9e8b6439f224899))
* **e2e:** use emulator auth hook for reliable CI sign-in ([b60756d](https://github.com/andrewtryder/sunsethue-helper/commit/b60756dcf1a5bd800f8a136e350732cdf3e2d3f7))
* **functions:** mount EMAIL_TO secret on endpoint functions ([623955a](https://github.com/andrewtryder/sunsethue-helper/commit/623955a42b2fbf922a54540b827ae984270c4762))
* **functions:** remove EMAIL_FROM from GCP secrets to prevent crash ([d943ab8](https://github.com/andrewtryder/sunsethue-helper/commit/d943ab82e24f73aeb1645809a7bcb926ef18120b))
* **functions:** remove EMAIL_FROM from secrets configuration ([e613b0f](https://github.com/andrewtryder/sunsethue-helper/commit/e613b0fdd88bd4c433d5df948aa1dd0852c0c72c))
* **worker:** add hourly cron trigger for scheduled emails ([f26811c](https://github.com/andrewtryder/sunsethue-helper/commit/f26811c5effd1f32eb629c9e4bb52d6f76203e86))
* **worker:** bypass dns.lookup in restricted edge runtime ([c0046c0](https://github.com/andrewtryder/sunsethue-helper/commit/c0046c0c8b994ececdd7a47ada5d6da65026e3b0))
* **worker:** migrate from nodemailer to worker-mailer for tcp sockets ([f1e8074](https://github.com/andrewtryder/sunsethue-helper/commit/f1e8074fa6dce27ca1b4c1b0b4680776a450f393))


### Performance Improvements

* **formatting:** cache Intl.DateTimeFormat for date/time parsing ([#24](https://github.com/andrewtryder/sunsethue-helper/issues/24)) ([af52872](https://github.com/andrewtryder/sunsethue-helper/commit/af528722b0a11f35022939731b605da60c05e9e9))
* **report:** parallelize api fetches and sequence db writes ([#23](https://github.com/andrewtryder/sunsethue-helper/issues/23)) ([5c770e3](https://github.com/andrewtryder/sunsethue-helper/commit/5c770e351e503f4f2935a38f1daad7f416a1de9d))
* **worker:** run forecast API queries concurrently ([#21](https://github.com/andrewtryder/sunsethue-helper/issues/21)) ([a0b4a1f](https://github.com/andrewtryder/sunsethue-helper/commit/a0b4a1ff51cf92944fdef2a64ec93b1037c8a320))

## [1.13.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.12.1...sunsethue-helper-v1.13.0) (2026-06-22)


### Features

* **ui:** improve screen reader accessibility for icon buttons ([#22](https://github.com/andrewtryder/sunsethue-helper/issues/22)) ([036ac36](https://github.com/andrewtryder/sunsethue-helper/commit/036ac3652d4f3be590b523fdc418bda5377309c4))


### Performance Improvements

* **formatting:** cache Intl.DateTimeFormat for date/time parsing ([#24](https://github.com/andrewtryder/sunsethue-helper/issues/24)) ([af52872](https://github.com/andrewtryder/sunsethue-helper/commit/af528722b0a11f35022939731b605da60c05e9e9))
* **report:** parallelize api fetches and sequence db writes ([#23](https://github.com/andrewtryder/sunsethue-helper/issues/23)) ([5c770e3](https://github.com/andrewtryder/sunsethue-helper/commit/5c770e351e503f4f2935a38f1daad7f416a1de9d))
* **worker:** run forecast API queries concurrently ([#21](https://github.com/andrewtryder/sunsethue-helper/issues/21)) ([a0b4a1f](https://github.com/andrewtryder/sunsethue-helper/commit/a0b4a1ff51cf92944fdef2a64ec93b1037c8a320))

## [1.12.1](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.12.0...sunsethue-helper-v1.12.1) (2026-06-20)


### Bug Fixes

* **worker:** migrate from nodemailer to worker-mailer for tcp sockets ([f1e8074](https://github.com/andrewtryder/sunsethue-helper/commit/f1e8074fa6dce27ca1b4c1b0b4680776a450f393))

## [1.12.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.11.0...sunsethue-helper-v1.12.0) (2026-06-20)


### Features

* **cf:** migrate from firebase to cloudflare ([13fd9f3](https://github.com/andrewtryder/sunsethue-helper/commit/13fd9f3fc631613b71f89e39e33e99edffbe4f01))


### Bug Fixes

* **ci:** solve audit vulnerabilities and force node 24 ([1b95e6f](https://github.com/andrewtryder/sunsethue-helper/commit/1b95e6f36621763860f790d95969e37b86b5b4b4))
* **worker:** bypass dns.lookup in restricted edge runtime ([c0046c0](https://github.com/andrewtryder/sunsethue-helper/commit/c0046c0c8b994ececdd7a47ada5d6da65026e3b0))

## [1.11.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.10.3...sunsethue-helper-v1.11.0) (2026-06-14)


### Features

* **report:** add webapp dashboard link to automated report emails ([e43f8e8](https://github.com/andrewtryder/sunsethue-helper/commit/e43f8e8b859f74b50d7365baf30ba88a20949efa))

## [1.10.3](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.10.2...sunsethue-helper-v1.10.3) (2026-06-13)


### Bug Fixes

* **api:** trim SUNSETHUE_API_KEY to handle trailing newlines ([7815556](https://github.com/andrewtryder/sunsethue-helper/commit/781555655302077ff6f542388b829b80b6a4ac31))
* **auth:** trim and ignore case of authorized email addresses ([8f3ebed](https://github.com/andrewtryder/sunsethue-helper/commit/8f3ebed1a0cc93e4e9fc8ca3374f24bb0ae516db))
* **functions:** mount EMAIL_TO secret on endpoint functions ([623955a](https://github.com/andrewtryder/sunsethue-helper/commit/623955a42b2fbf922a54540b827ae984270c4762))

## [1.10.2](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.10.1...sunsethue-helper-v1.10.2) (2026-06-13)


### Bug Fixes

* **functions:** remove EMAIL_FROM from secrets configuration ([e613b0f](https://github.com/andrewtryder/sunsethue-helper/commit/e613b0fdd88bd4c433d5df948aa1dd0852c0c72c))

## [1.10.1](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.10.0...sunsethue-helper-v1.10.1) (2026-06-13)


### Bug Fixes

* **e2e:** fetch authorized email dynamically on startup ([e86ac3c](https://github.com/andrewtryder/sunsethue-helper/commit/e86ac3cd6b51aed4ad720867caf8926c8210e0a3))
* **e2e:** robust email validation fallback and config fetch timeout ([59a2817](https://github.com/andrewtryder/sunsethue-helper/commit/59a281748fcb92838ea47169e4a86ceb32608300))
* **e2e:** use demo project for offline emulator runs ([fb6e476](https://github.com/andrewtryder/sunsethue-helper/commit/fb6e476fab949726a569946bc9e8b6439f224899))
* **functions:** remove EMAIL_FROM from GCP secrets to prevent crash ([d943ab8](https://github.com/andrewtryder/sunsethue-helper/commit/d943ab82e24f73aeb1645809a7bcb926ef18120b))

## [1.10.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.9.0...sunsethue-helper-v1.10.0) (2026-06-09)


### Features

* **email:** remove times and style quality badge background ([1fd78ec](https://github.com/andrewtryder/sunsethue-helper/commit/1fd78ecc6ab8d685d9b23413cb155f7c5862e7d7))
* **report:** add 12:00 pm scheduled report email ([239ec53](https://github.com/andrewtryder/sunsethue-helper/commit/239ec53dc5c874506450cf4f2d1a00a5b5ef113a))

## [Unreleased]

### Features

* **email:** remove times and use quality color as background for badge
* **report:** add noon (12:00 PM Eastern) scheduled report function

## [1.9.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.8.0...sunsethue-helper-v1.9.0) (2026-06-08)


### Features

* **ui:** polish email modal and show api credits on logs ([bb8ab93](https://github.com/andrewtryder/sunsethue-helper/commit/bb8ab936ef12b98c49b5bb6e96a4db39c827726a))

## [1.8.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.7.0...sunsethue-helper-v1.8.0) (2026-06-08)


### Features

* **ui:** fix email modal, table email layout, and preview command ([a9505c3](https://github.com/andrewtryder/sunsethue-helper/commit/a9505c334dde8ebc4f0e131876850e39a84286a3))

## [1.7.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.6.0...sunsethue-helper-v1.7.0) (2026-06-08)


### Features

* apply Stitch Twilight Glass design system to frontend ([2d44a41](https://github.com/andrewtryder/sunsethue-helper/commit/2d44a41f40b984c0d1fff16d7396fbc6b1f5834c))
* **ci:** add tests, CI pipeline, and quality normalization ([559285e](https://github.com/andrewtryder/sunsethue-helper/commit/559285e089ab9adab15fe79b3923ee26eb66c090))
* **ui:** add email success modal and mobile-friendly reports ([b8917f4](https://github.com/andrewtryder/sunsethue-helper/commit/b8917f4b8327f5e8fa5c870e961103bbb07f21c5))
* **ui:** obsidian flux redesign for frontend and email ([d3ee12d](https://github.com/andrewtryder/sunsethue-helper/commit/d3ee12d9469afae7329240445f995e35f86eb396))


### Bug Fixes

* **ci:** require Java 21 for Firebase emulator E2E job ([e9d0df5](https://github.com/andrewtryder/sunsethue-helper/commit/e9d0df55735c00956574a1a5e8fbfeeaa2fb39fb))
* **e2e:** stabilize auth emulator login in CI ([a636fff](https://github.com/andrewtryder/sunsethue-helper/commit/a636fff7884396f7d4b2f8b02c894d3a6ad1e550))
* **e2e:** use emulator auth hook for reliable CI sign-in ([b60756d](https://github.com/andrewtryder/sunsethue-helper/commit/b60756dcf1a5bd800f8a136e350732cdf3e2d3f7))

## [1.6.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.5.3...v1.6.0) (2026-06-08)

### Features

* obsidian flux redesign for frontend and email
* obsidian flux design reference and stitch dashboard assets under docs/
* shared quality-dot color helpers in frontend and backend

### Bug Fixes

* restore loading overlay fade-out so auth init no longer blocks clicks

## [1.5.3](https://github.com/andrewtryder/sunsethue-helper/compare/v1.5.2...v1.5.3) (2026-05-29)

### Features

* dynamic AM email column ordering puts next sunset first for morning reports

## [1.5.2](https://github.com/andrewtryder/sunsethue-helper/compare/v1.5.1...v1.5.2) (2026-05-28)

### Bug Fixes

* preserve material symbols icons on search and save buttons during state transitions

## [1.5.1](https://github.com/andrewtryder/sunsethue-helper/compare/v1.5.0...v1.5.1) (2026-05-28)

### Bug Fixes

* allow email/password users to read and write firestore without verified-email rule

## [1.5.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.4.0...v1.5.0) (2026-05-27)

### Features

* full-screen loading overlay with fade-out to prevent auth layout flicker
* keyboard navigation for address autocomplete suggestions
* cloud function location query limit to reduce firestore reads
* bind cloud function secrets through gcp secret manager
* harden alert banner timeout tracking in public app

## [1.4.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.3.0...v1.4.0) (2026-05-27)

### Features

* relocate design system docs to docs/design.md
* refactor backend tests to import helpers from functions index

### Bug Fixes

* restrict firestore access to authorized email in security rules

## [1.3.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.2.0...v1.3.0) (2026-05-27)

### Features

* frontend structural validation suite scripts/test-frontend.js
* local git pre-commit hook wrapper and installer script
* project changelog documentation

### Continuous Integration

* run frontend structural tests in github actions deploy workflow

## [1.2.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.1.0...v1.2.0) (2026-05-27)

### Features

* initialize git repository and ci/cd deploy workflow
* add readme and planning artifacts under docs/

### Bug Fixes

* replace docker firebase action with native firebase-tools in github actions

## [1.1.0](https://github.com/andrewtryder/sunsethue-helper/compare/v1.0.0...v1.1.0) (2026-05-27)

### Features

* tabbed dashboard for forecast, locations, and execution logs
* live forecast dashboard preview mirroring email reports
* color-coded forecast quality badges in dashboard table
* resilient try-catch wrappers around frontend render cycles
* upgrade cloud functions runtime to node.js 22
* remove logs popup modal

### Bug Fixes

* clear forecast dashboard when location list becomes empty

## [1.0.0](https://github.com/andrewtryder/sunsethue-helper/releases/tag/v1.0.0) (2026-05-27)

### Features

* firebase-hosted architecture with auth restricted to authorized email
* geocoding proxy and photon autocomplete search
* device geolocation support for location entry
* scheduled am/pm cloud functions for daily forecast emails
* nodemailer email delivery and firestore run logging
