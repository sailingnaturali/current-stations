# Releasing

Two artifacts ship per release: the **npm package** (code, schema, docs) and the
**US station bundle** attached to the GitHub release.

`currents.json` is committed **pretty-printed** (~2.9 MB) so a NOAA revision is
reviewable as a diff — that is the whole point of the
[update-stations](.github/workflows/update-stations.yml) workflow. The release asset is
**minified** (~1.6 MB) from that same file, so consumers vendor the small one.

The bundle is not in the npm tarball on purpose — most consumers want either a small
regional subset they extract themselves, or the prebuilt bundle vendored once. Making
every install carry it serves neither.

## Building the bundle

Either locally or in CI — a full US extraction completes from a GitHub-hosted runner in
~25 minutes with no throttling failures (verified 2026-07-19), producing counts identical
to a local run. The old "must be built on a residential connection" caveat was wrong.

## Steps

Normally you do NOT extract by hand — `update-stations` opens a PR when NOAA moves.
Merge that first, then:

```bash
# 1. minify the committed bundle into the release asset
npm run bundle:min          # currents.json -> currents.min.json

# 2. structural check (also run in the update PR, but cheap to repeat)
npm run validate:bundle

# 3. tag and release — triggers the npm publish workflow
gh release create v0.2.0 --notes "..."

# 4. attach the bundle, named currents.json so vendoring scripts don't change
gh release upload v0.2.0 currents.min.json#currents.json
```

Expect roughly 855 harmonic + 1,700 subordinate stations, and **0 unresolvable
references** (the extractor reports this). A nonzero count means NOAA changed something
— investigate before shipping.

## First publish of a new package

npm trusted publishing can't be configured for a package that doesn't exist yet, so the
**first** publish is manual with an OTP; after that the release workflow is hands-free:

1. `npm publish --otp=<code>` locally.
2. npmjs.com → package → **Settings → Trusted Publisher → GitHub Actions**: repo
   `sailingnaturali/current-stations`, workflow `publish.yml`, environment blank.
3. From then on `gh release create` publishes via OIDC.

A brand-new scoped package can 404 from the registry API for a few minutes after a
successful publish — that's propagation, not failure.

## Consumers to bump

- `slackwater-engine` — vendors `currents.json` into `Sources/TideEngine/Resources/`
  (`tools/vendor-currents.sh`). Re-run its currents tests after.
- `signalk-currents` — depends on the npm package; runs `extract --stations …` for its
  own subset.
- `slackwater-web` — vendors a Salish Sea extract (`data/noaa-currents.json`,
  `npx current-stations extract … --box 47,-125.5,50.5,-122`). Re-run its
  `npm test` after re-vendoring.
