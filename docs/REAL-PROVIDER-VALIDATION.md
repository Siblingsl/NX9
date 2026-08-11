# NX9 Real Provider Validation

The browser E2E suite uses mock HTTP routes. It does not prove that an external model provider is reachable or that its credentials, quota, and failure responses work.

## Safe default

The real-provider command is opt-in and never runs as part of `pnpm test`:

```powershell
$env:NX9_REAL_PROVIDER_TEST='1'
$env:NX9_PROVIDER_HEALTHCHECK_URL='https://provider.example/v1/models'
$env:NX9_PROVIDER_AUTH='replace-with-a-short-lived-test-key'
pnpm --filter @nx9/server test:real-provider
```

Use a low-cost provider health endpoint for the live check. Do not put keys in this document, shell history, CI logs, or source control.

## Failure cases

Configure deterministic endpoints from the provider sandbox, staging gateway, or an approved fault-injection proxy:

```powershell
$env:NX9_PROVIDER_CASE_429_URL='https://fault-proxy.example/provider/429'
$env:NX9_PROVIDER_CASE_401_URL='https://fault-proxy.example/provider/401'
$env:NX9_PROVIDER_CASE_500_URL='https://fault-proxy.example/provider/500'
$env:NX9_PROVIDER_TIMEOUT_URL='https://fault-proxy.example/provider/timeout'
pnpm --filter @nx9/server test:real-provider
```

The command requires exact HTTP statuses for 429, 401, and 500. The timeout endpoint must exceed `NX9_PROVIDER_TIMEOUT_MS` (default `30000`). A real provider normally cannot be safely forced to emit these conditions, so use its documented sandbox or an authorized proxy rather than intentionally exhausting production quota.

## NX9 error contract

- `401` and `403`: authentication or permission failure.
- `429`: rate limit or quota exhaustion.
- `504`: NX9 request timeout.
- `502`: provider 5xx or other upstream HTTP failure.

The contract is covered without network access by `apps/server/test/gateway-upstream-error.test.ts`. The real smoke command is the evidence required for a specific provider/account; skipped URLs are reported explicitly and do not count as validated.
