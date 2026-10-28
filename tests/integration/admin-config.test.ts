import assert from "node:assert/strict";
import test from "node:test";

// Relative import on purpose: the alias "@/lib/firebase/admin" points to the fake in these tests.
import { getFirebaseAdminConfigStatus, normalizePrivateKey } from "../../src/lib/firebase/admin";

const KEY_BODY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC";
const PEM = `-----BEGIN PRIVATE KEY-----\n${KEY_BODY}\n-----END PRIVATE KEY-----\n`;

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const keys = ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)));
  try { run(); } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
}

test("chave privada colada na Vercel com aspas e \\n literais é normalizada", () => {
  const pasted = `"-----BEGIN PRIVATE KEY-----\\n${KEY_BODY}\\n-----END PRIVATE KEY-----\\n"`;
  assert.equal(normalizePrivateKey(pasted), PEM);
  assert.equal(normalizePrivateKey(PEM), PEM, "chave com quebras reais continua igual");
});

test("variáveis separadas válidas", () => {
  withEnv({ FIREBASE_PROJECT_ID: "meu-projeto", FIREBASE_CLIENT_EMAIL: "sa@meu-projeto.iam.gserviceaccount.com", FIREBASE_PRIVATE_KEY: `"${PEM.replace(/\n/g, "\\n")}"`, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "meu-projeto" }, () => {
    const status = getFirebaseAdminConfigStatus();
    assert.equal(status.ok, true, status.problems.join(" "));
    assert.equal(status.source, "separate_variables");
  });
});

test("JSON inteiro da conta de serviço (texto ou base64)", () => {
  const json = JSON.stringify({ project_id: "meu-projeto", client_email: "sa@meu-projeto.iam.gserviceaccount.com", private_key: PEM });
  for (const value of [json, Buffer.from(json).toString("base64")]) {
    withEnv({ FIREBASE_SERVICE_ACCOUNT: value, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "meu-projeto" }, () => {
      const status = getFirebaseAdminConfigStatus();
      assert.equal(status.ok, true, status.problems.join(" "));
      assert.equal(status.source, "service_account_json");
    });
  }
});

test("projetos diferentes entre servidor e site são apontados", () => {
  withEnv({ FIREBASE_PROJECT_ID: "projeto-a", FIREBASE_CLIENT_EMAIL: "sa@projeto-a.iam.gserviceaccount.com", FIREBASE_PRIVATE_KEY: PEM, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "projeto-b" }, () => {
    const status = getFirebaseAdminConfigStatus();
    assert.equal(status.ok, false);
    assert.match(status.problems.join(" "), /projeto-a.*projeto-b/);
  });
});

test("chave incompleta e variáveis ausentes geram explicação", () => {
  withEnv({ FIREBASE_PROJECT_ID: "p", FIREBASE_CLIENT_EMAIL: "sa@p.iam.gserviceaccount.com", FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc" }, () => {
    assert.match(getFirebaseAdminConfigStatus().problems.join(" "), /incompleta/);
  });
  withEnv({}, () => {
    const problems = getFirebaseAdminConfigStatus().problems.join(" ");
    assert.match(problems, /FIREBASE_PROJECT_ID ausente/);
    assert.match(problems, /FIREBASE_PRIVATE_KEY ausente/);
  });
});

test("limpeza apaga só registros temporários vencidos", async () => {
  const { POST: cleanup } = await import("@/app/api/admin/operations/cleanup/route");
  const { fakeDb } = await import("../fakes/firebase-admin");
  const { ADMIN_UID, KITCHEN_UID, seedRestaurant, staffRequest, json } = await import("./helpers");
  seedRestaurant();
  const old = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  await fakeDb.collection("publicRateLimits").doc("velho").set({ resetAt: old, count: 3 });
  await fakeDb.collection("publicRateLimits").doc("atual").set({ resetAt: future, count: 1 });
  await fakeDb.collection("sessionAccessGrants").doc("g-velho").set({ expiresAt: old });
  await fakeDb.collection("sessionAccessGrants").doc("g-atual").set({ expiresAt: future });
  await fakeDb.collection("orderIdempotency").doc("i-velho").set({ expiresAt: old });

  assert.equal((await cleanup(staffRequest("/api/admin/operations/cleanup", KITCHEN_UID, {}))).status, 403, "só administração limpa");
  const body = await json(await cleanup(staffRequest("/api/admin/operations/cleanup", ADMIN_UID, {})));
  assert.equal(body.total, 3);
  assert.deepEqual(fakeDb.all("publicRateLimits").map((item) => item.id), ["atual"]);
  assert.deepEqual(fakeDb.all("sessionAccessGrants").map((item) => item.id), ["g-atual"]);
  assert.equal(fakeDb.all("orderIdempotency").length, 0);
});

test("editar mesa pelo painel não troca o QR Code nem reativa a mesa", async () => {
  const { updateTablePayloadSchema, updateRestaurantSettingsPayloadSchema } = await import("@/lib/schemas");
  assert.deepEqual(updateTablePayloadSchema.parse({ number: 4, label: "Mesa 4", capacity: 4 }), { number: 4, label: "Mesa 4", capacity: 4 });
  assert.deepEqual(updateTablePayloadSchema.parse({ isActive: true, status: "free", currentSessionGroupId: null }), { isActive: true, status: "free", currentSessionGroupId: null });
  assert.equal("publicToken" in updateTablePayloadSchema.parse({ publicToken: "x".repeat(43) }), false, "o QR só muda pelo servidor");
  assert.deepEqual(updateRestaurantSettingsPayloadSchema.parse({ pixKey: "chave" }), { pixKey: "chave" }, "atualização parcial não traz valores padrão");
});
