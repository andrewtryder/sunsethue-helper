# Changelog

All notable changes to this project are documented in this file.

This changelog follows [Conventional Commits](https://www.conventionalcommits.org/) and is maintained by [release-please](https://github.com/googleapis/release-please). Release sections group changes by commit type (`feat`, `fix`, etc.). Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
* **cf:** migrate from firebase to cloudflare ([e37b9d2](https://github.com/andrewtryder/sunsethue-helper/commit/e37b9d2f1166a0308f5defc1db69e2a8fa615295))
* **ci:** add tests, CI pipeline, and quality normalization ([559285e](https://github.com/andrewtryder/sunsethue-helper/commit/559285e089ab9adab15fe79b3923ee26eb66c090))
* **ci:** add tests, CI pipeline, and quality normalization ([2ab50b9](https://github.com/andrewtryder/sunsethue-helper/commit/2ab50b9f551d64d5830a6e046eb0cb0e20a22a80))
* **email:** remove times and style quality badge background ([1fd78ec](https://github.com/andrewtryder/sunsethue-helper/commit/1fd78ecc6ab8d685d9b23413cb155f7c5862e7d7))
* **email:** remove times and style quality badge background ([863fd9b](https://github.com/andrewtryder/sunsethue-helper/commit/863fd9bf3ba04a3ec941200eb1d70afc0723f52a))
* **repo:** resolve code review findings and support usage endpoint ([3f7463c](https://github.com/andrewtryder/sunsethue-helper/commit/3f7463c0796931f402d875bc793b8587f0aff766))
* **report:** add 12:00 pm scheduled report email ([239ec53](https://github.com/andrewtryder/sunsethue-helper/commit/239ec53dc5c874506450cf4f2d1a00a5b5ef113a))
* **report:** add webapp dashboard link to automated report emails ([e43f8e8](https://github.com/andrewtryder/sunsethue-helper/commit/e43f8e8b859f74b50d7365baf30ba88a20949efa))
* **report:** add webapp dashboard link to automated report emails ([17f7ebb](https://github.com/andrewtryder/sunsethue-helper/commit/17f7ebbe9c5cf020f7011a819ffdaa13300a401a))
* **ui:** add email success modal and mobile-friendly reports ([b8917f4](https://github.com/andrewtryder/sunsethue-helper/commit/b8917f4b8327f5e8fa5c870e961103bbb07f21c5))
* **ui:** fix email modal, table email layout, and preview command ([a9505c3](https://github.com/andrewtryder/sunsethue-helper/commit/a9505c334dde8ebc4f0e131876850e39a84286a3))
* **ui:** fix email modal, table email layout, and preview command ([9f1fa93](https://github.com/andrewtryder/sunsethue-helper/commit/9f1fa9304f8eb3df8e99a68f33db3bfb2154ae7a))
* **ui:** improve screen reader accessibility for icon buttons ([#22](https://github.com/andrewtryder/sunsethue-helper/issues/22)) ([036ac36](https://github.com/andrewtryder/sunsethue-helper/commit/036ac3652d4f3be590b523fdc418bda5377309c4))
* **ui:** obsidian flux redesign for frontend and email ([d3ee12d](https://github.com/andrewtryder/sunsethue-helper/commit/d3ee12d9469afae7329240445f995e35f86eb396))
* **ui:** obsidian flux redesign for frontend and email ([0b82bb0](https://github.com/andrewtryder/sunsethue-helper/commit/0b82bb00e2c3c97a272a5d6d8c96c43bf10a447d))
* **ui:** polish email modal and show api credits on logs ([bb8ab93](https://github.com/andrewtryder/sunsethue-helper/commit/bb8ab936ef12b98c49b5bb6e96a4db39c827726a))
* **ui:** polish email modal and show api credits on logs ([918caaf](https://github.com/andrewtryder/sunsethue-helper/commit/918caaf870d69c027bef8292de773d88b8b67d91))


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
* **cf:** migrate from firebase to cloudflare ([e37b9d2](https://github.com/andrewtryder/sunsethue-helper/commit/e37b9d2f1166a0308f5defc1db69e2a8fa615295))


### Bug Fixes

* **ci:** solve audit vulnerabilities and force node 24 ([1b95e6f](https://github.com/andrewtryder/sunsethue-helper/commit/1b95e6f36621763860f790d95969e37b86b5b4b4))
* **worker:** bypass dns.lookup in restricted edge runtime ([c0046c0](https://github.com/andrewtryder/sunsethue-helper/commit/c0046c0c8b994ececdd7a47ada5d6da65026e3b0))

## [1.11.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.10.3...sunsethue-helper-v1.11.0) (2026-06-14)


### Features

* **report:** add webapp dashboard link to automated report emails ([e43f8e8](https://github.com/andrewtryder/sunsethue-helper/commit/e43f8e8b859f74b50d7365baf30ba88a20949efa))
* **report:** add webapp dashboard link to automated report emails ([17f7ebb](https://github.com/andrewtryder/sunsethue-helper/commit/17f7ebbe9c5cf020f7011a819ffdaa13300a401a))

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
* **ui:** polish email modal and show api credits on logs ([918caaf](https://github.com/andrewtryder/sunsethue-helper/commit/918caaf870d69c027bef8292de773d88b8b67d91))

## [1.8.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.7.0...sunsethue-helper-v1.8.0) (2026-06-08)


### Features

* **ui:** fix email modal, table email layout, and preview command ([a9505c3](https://github.com/andrewtryder/sunsethue-helper/commit/a9505c334dde8ebc4f0e131876850e39a84286a3))
* **ui:** fix email modal, table email layout, and preview command ([9f1fa93](https://github.com/andrewtryder/sunsethue-helper/commit/9f1fa9304f8eb3df8e99a68f33db3bfb2154ae7a))

## [1.7.0](https://github.com/andrewtryder/sunsethue-helper/compare/sunsethue-helper-v1.6.0...sunsethue-helper-v1.7.0) (2026-06-08)


### Features

* apply Stitch Twilight Glass design system to frontend ([2d44a41](https://github.com/andrewtryder/sunsethue-helper/commit/2d44a41f40b984c0d1fff16d7396fbc6b1f5834c))
* **ci:** add tests, CI pipeline, and quality normalization ([559285e](https://github.com/andrewtryder/sunsethue-helper/commit/559285e089ab9adab15fe79b3923ee26eb66c090))
* **ci:** add tests, CI pipeline, and quality normalization ([2ab50b9](https://github.com/andrewtryder/sunsethue-helper/commit/2ab50b9f551d64d5830a6e046eb0cb0e20a22a80))
* **ui:** add email success modal and mobile-friendly reports ([b8917f4](https://github.com/andrewtryder/sunsethue-helper/commit/b8917f4b8327f5e8fa5c870e961103bbb07f21c5))
* **ui:** obsidian flux redesign for frontend and email ([d3ee12d](https://github.com/andrewtryder/sunsethue-helper/commit/d3ee12d9469afae7329240445f995e35f86eb396))
* **ui:** obsidian flux redesign for frontend and email ([0b82bb0](https://github.com/andrewtryder/sunsethue-helper/commit/0b82bb00e2c3c97a272a5d6d8c96c43bf10a447d))


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
