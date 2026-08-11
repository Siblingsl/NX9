const required = process.env.NX9_REAL_PROVIDER_TEST === '1';

if (!required) {
  console.error('Refusing to call a real provider. Set NX9_REAL_PROVIDER_TEST=1 explicitly.');
  process.exit(2);
}

const timeoutMs = Number(process.env.NX9_PROVIDER_TIMEOUT_MS || 30_000);
const auth = process.env.NX9_PROVIDER_AUTH || '';
const headers = auth ? { Authorization: `Bearer ${auth}` } : {};

async function call(name, url, expected) {
  if (!url) {
    console.log(`${name}: SKIP (URL not configured)`);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.text();
    if (response.status !== expected) {
      throw new Error(`${name}: expected HTTP ${expected}, received ${response.status}: ${body.slice(0, 180)}`);
    }
    console.log(`${name}: PASS (HTTP ${response.status})`);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${name}: timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const cases = [
  ['live health check', process.env.NX9_PROVIDER_HEALTHCHECK_URL, 200],
  ['rate limit (429)', process.env.NX9_PROVIDER_CASE_429_URL, 429],
  ['authentication (401)', process.env.NX9_PROVIDER_CASE_401_URL, 401],
  ['server error (5xx)', process.env.NX9_PROVIDER_CASE_500_URL, 500],
];

let failed = false;
for (const [name, url, expected] of cases) {
  try {
    await call(name, url, expected);
  } catch (error) {
    failed = true;
    console.error(`FAIL: ${error.message}`);
  }
}

if (!process.env.NX9_PROVIDER_TIMEOUT_URL) {
  console.log('timeout: SKIP (NX9_PROVIDER_TIMEOUT_URL not configured)');
} else {
  try {
    await call('timeout', process.env.NX9_PROVIDER_TIMEOUT_URL, 200);
    failed = true;
    console.error('FAIL: timeout endpoint returned before the configured deadline');
  } catch (error) {
    if (!String(error.message).includes('timeout')) {
      failed = true;
      console.error(`FAIL: ${error.message}`);
    } else {
      console.log('timeout: PASS');
    }
  }
}

process.exitCode = failed ? 1 : 0;
