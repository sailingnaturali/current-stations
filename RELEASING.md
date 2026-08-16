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

When the release adds a bundle field that the committed `currents.json` predates (e.g.
`crossFlow` as of 0.3.0), force-run `update-stations` and merge the resulting bundle PR
**before** tagging — otherwise the release asset ships a shape that doesn't match what
README/schema just started documenting:

```bash
gh workflow run update-stations.yml -f force=true
# then merge the PR it opens, before step 3 below
```

```bash
# 1. minify the committed bundle into the release asset
npm run bundle:min          # currents.json -> currents.min.json

# 2. structural check (also run in the update PR, but cheap to repeat)
npm run validate:bundle

# 3. tag and release — triggers the npm publish workflow
gh release create v0.2.0 --notes "..."

# 4. attach the bundle, named currents.json so vendoring scripts don't change.
#    Copy to the right name first — `gh` does NOT support a `file#displayname`
#    rename on upload; it silently uploads under the on-disk basename. That is
#    why v0.2.0 and v0.2.1 shipped as `currents.min.json` and slackwater-engine's
#    `--pattern currents.json` could not match them.
mkdir -p /tmp/rel && cp currents.min.json /tmp/rel/currents.json
gh release upload v0.2.0 /tmp/rel/currents.json
```

Verify the asset is reachable the way consumers actually fetch it, rather than
trusting the upload:

```bash
gh release download v0.2.0 --pattern currents.json --output /tmp/check.json --clobber
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
