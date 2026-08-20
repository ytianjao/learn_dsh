# Delivery report

## Delivered

LearnLoop is a tree-out package for DSH Web. Its Host owns one schema-versioned storage domain and a revision-fenced whole-state endpoint. Its Client contributes Plan, Progress and Review conversation views, onboarding/current-task dock and settings. Ordinary streaming conversation and model configuration remain the official DSH surfaces; LearnLoop does not implement a provider client or credential path.

The authoritative state includes a project, immutable Plan versions, tasks, evidence sources, explained discrete mastery, persisted review events, next-action calculation, adjustment proposals/diffs and user decisions. Mutations are idempotent where retries could duplicate facts. Major adjustments do not change the active Plan before approval.

## Baseline

DSH `dsh-v0.1.0-rc.8`, commit `141eb6fef83422698aef7a981029e843e8161534`; Node `^22.19 || >=24`. The primary risk is the carried lazy-CJS Client Module adapter because upstream does not publish the corresponding bundle preset.

## Verification

The keyless gates cover domain invariants, evidence deduplication/mastery, next action, adjustment approval/versioning, HTTP projection/concurrency, exact DSH peer pins, client syntax, build and package contents. Browser acceptance uses a running fixture profile and generates screenshots from the real DSH page under the ignored `test-results/` directory; generated images are not committed.

The paid live DeepSeek smoke is intentionally user-controlled and is not represented as automated evidence. After the user stores a credential in DSH Web, verify one streamed teaching reply and the scenarios in `docs/WEB_ACCEPTANCE.md`. LearnLoop never reads the credential.

## Limitations

The rc.8 tree-out Client Module format is prerelease and must be retested on every DSH upgrade. JSON export is an audit/backup artifact; complete restore uses the DSH Home backup mechanism. The deterministic onboarding plan currently targets the Agent-engineering curriculum inferred from the supplied goal; semantic plan generation and candidate extraction occur in normal DSH conversation and are not a separate paid background call.
