import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("cada celular recebe documento de autorização independente", () => {
  const source = read("src/lib/server/public-session.ts");
  assert.match(source, /doc\(grantId\)\.set/);
  assert.doesNotMatch(source, /sessionAccessGrants"\)\.doc\(session\.id\)/);
});

test("código é renovado, derivado com scrypt e limitado persistentemente", () => {
  const helper = read("src/lib/server/public-session.ts");
  const opening = read("src/app/api/admin/table/open/route.ts");
  assert.match(helper, /scryptSync/);
  assert.match(helper, /accessFailedAttempts/);
  assert.match(helper, /accessLockedUntil/);
  assert.match(opening, /createAttendanceCode\(\)/);
  assert.doesNotMatch(opening, /accessCodeHash: attendanceCode\.code/);
});

test("API de mesa não serializa documentos completos nem código", () => {
  const source = read("src/app/api/public/table/[token]/route.ts");
  assert.doesNotMatch(source, /NextResponse\.json\([^)]*\.\.\.table/);
  assert.doesNotMatch(source, /NextResponse\.json\([^)]*\.\.\.session/);
  assert.doesNotMatch(source, /accessCode(Hash|Salt)?\s*:/);
  assert.doesNotMatch(source, /pinCode\s*:/);
});

test("operações protegidas usam cookie, CSRF e vínculo servidor", () => {
  for (const route of ["src/app/api/public/order/route.ts", "src/app/api/public/waiter-call/route.ts", "src/app/api/public/session/action/route.ts"]) {
    const source = read(route);
    assert.match(source, /resolveAuthorizedSession/);
    assert.match(source, /x-csrf-token/);
    assert.doesNotMatch(source, /x-session-access-token/);
  }
});

test("links e endpoint antigos têm comportamento controlado", () => {
  assert.match(read("src/app/m/[sessionToken]/page.tsx"), /redirect\("\/\?mesa=link-antigo"\)/);
  assert.match(read("src/app/api/public/session/state/[sessionToken]/route.ts"), /status: 410/);
});
