# Releasing

Two artifacts ship per release: the **npm package** (code, schema, docs) and the
**US station bundle** (`currents.json`, ~1.6 MB) attached to the GitHub release.

The bundle is not in the npm tarball on purpose — most consumers want either a small
regional subset they extract themselves, or the prebuilt bundle vendored once. Making
every install carry 1.6 MB serves neither.

## Why the bundle is built by hand

**NOAA 404s the metadata API from datacenter IPs.** A GitHub Actions runner cannot
extract it. The bundle has to be built on a residential connection and uploaded.

## Steps

```bash
# 1. from a residential connection — takes several minutes, paced at 400 ms
npx current-stations extract currents.json

# 2. sanity-check the counts before shipping
node -e "const b=require('./currents.json');
  const n=t=>b.stations.filter(s=>s.type===t).length;
  console.log(n('harmonic'),'harmonic,',n('subordinate'),'subordinate')"

# 3. tag and release — this triggers the npm publish workflow
gh release create v0.1.0 --notes "..."

# 4. attach the bundle to the release
gh release upload v0.1.0 currents.json
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
