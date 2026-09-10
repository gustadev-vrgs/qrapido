import assert from "node:assert/strict";
import test from "node:test";
import roles from "../.tmp/tests/auth/roles.js";
import urls from "../.tmp/tests/utils/public-url.js";

test("função real de autorização aceita apenas funções do dashboard", () => {
  for (const role of ["admin", "manager", "attendant", "kitchen"]) assert.equal(roles.canAccessDashboard(role), true);
  assert.equal(roles.canAccessDashboard("customer"), false);
});

function preservingPublicAppUrl(run) {
  const wasDefined = Object.hasOwn(process.env, "NEXT_PUBLIC_APP_URL");
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  try {
    return run();
  } finally {
    if (wasDefined) process.env.NEXT_PUBLIC_APP_URL = previous;
    else delete process.env.NEXT_PUBLIC_APP_URL;
  }
}

test("URL pública usa origin como fallback, remove barras e substitui domínio antigo", { concurrency: false }, () => {
  preservingPublicAppUrl(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(urls.buildPublicTableUrl("mesa/a", "https://preview.example///"), "https://preview.example/mesa/mesa%2Fa");
    assert.equal(
      urls.resolvePublicTableUrl({ publicToken: "token", qrCodeValue: "https://old.invalid/m/secret" }, "https://app.example/"),
      "https://app.example/mesa/token"
    );
  });
});

test("NEXT_PUBLIC_APP_URL tem prioridade sobre origin", { concurrency: false }, () => {
  preservingPublicAppUrl(() => {
    process.env.NEXT_PUBLIC_APP_URL = " https://configured.example/// ";
    assert.equal(urls.buildPublicTableUrl("mesa/a", "https://ignored.example"), "https://configured.example/mesa/mesa%2Fa");
    assert.equal(
      urls.resolvePublicTableUrl({ publicToken: "new-token", qrCodeValue: "https://old.invalid/m/secret" }, "https://ignored.example"),
      "https://configured.example/mesa/new-token"
    );
  });
});
