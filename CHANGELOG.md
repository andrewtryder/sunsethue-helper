# Changelog

All notable changes to this project are documented in this file.

This changelog follows [Conventional Commits](https://www.conventionalcommits.org/) and is maintained by [release-please](https://github.com/googleapis/release-please). Release sections group changes by commit type (`feat`, `fix`, etc.). Version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
