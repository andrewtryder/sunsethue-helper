# Changelog

All notable changes to this project are documented in this file.

This changelog follows [Conventional Commits](https://www.conventionalcommits.org/) and is maintained by [release-please](https://github.com/googleapis/release-please). Release sections group changes by commit type (`feat`, `fix`, etc.). Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Features

* **email:** remove times and use quality color as background for badge

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
