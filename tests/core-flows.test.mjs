import assert from "node:assert/strict";
import test from "node:test";
import roles from "../.tmp/tests/auth/roles.js";
import urls from "../.tmp/tests/utils/public-url.js";

test("função real de autorização aceita apenas funções do dashboard", () => {
  for (const role of ["admin", "manager", "attendant", "kitchen"]) assert.equal(roles.canAccessDashboard(role), true);
  assert.equal(roles.canAccessDashboard("customer"), false);
});
test("função real de URL codifica token e não conserva domínio antigo", () => {
  assert.equal(urls.buildPublicTableUrl("mesa/a", "https://preview.example/"), "https://preview.example/mesa/mesa%2Fa");
  assert.equal(urls.resolvePublicTableUrl({ publicToken: "token", qrCodeValue: "https://old.invalid/m/secret" }, "https://app.example"), "https://app.example/mesa/token");
});
