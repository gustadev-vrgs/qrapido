import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// These overrides close known advisories in nested dependencies (npm audit = 0).
// A past change replaced the whole "overrides" block and silently reopened them.
test("overrides de segurança continuam no package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.overrides?.["jwks-rsa"], "3.2.2", "jwks-rsa fixo (firebase-admin na Vercel)");
  assert.match(String(pkg.overrides?.["@grpc/grpc-js"]), /^\^1\.14\./, "@grpc/grpc-js corrigido");
  assert.match(String(pkg.overrides?.next?.postcss), /^\^8\.5\./, "postcss dentro do next corrigido");
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const nested = lock.packages?.["node_modules/next/node_modules/postcss"];
  assert.ok(!nested || /^8\.5\./.test(nested.version), "lock sem postcss antigo dentro do next");
});
