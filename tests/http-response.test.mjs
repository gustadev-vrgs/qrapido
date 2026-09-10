import assert from "node:assert/strict";
import test from "node:test";
import { expectJson } from "./helpers/http.mjs";

test("HTTP helper consumes a successful body once and returns reusable JSON", async () => {
  const response = Response.json({ localId: "test-user", idToken: "test-token" });
  const data = await expectJson(response, 200, "signup");
  assert.equal(response.bodyUsed, true);
  assert.deepEqual(data, { localId: "test-user", idToken: "test-token" });
  assert.equal(data.localId, "test-user");
});

test("HTTP helper preserves the status assertion and API error message", async () => {
  const response = Response.json({ error: { message: "EMAIL_EXISTS" } }, { status: 400 });
  await assert.rejects(expectJson(response, 200, "signup"), {
    code: "ERR_ASSERTION", actual: 400, expected: 200,
    message: /signup: expected HTTP 200, received 400 \(EMAIL_EXISTS\)/
  });
});

test("HTTP helper diagnoses non-JSON failures and rejects invalid successful JSON", async () => {
  await assert.rejects(expectJson(new Response("Internal Server Error", { status: 500 }), 201, "open table"), {
    code: "ERR_ASSERTION", actual: 500, expected: 201
  });
  await assert.rejects(expectJson(new Response("not JSON"), 200, "signup"), /signup: HTTP 200 returned invalid JSON/);
});

test("HTTP helper does not print credentials when an unexpected success occurs", async () => {
  const response = Response.json({ idToken: "test-secret-that-must-not-be-logged" });
  await assert.rejects(expectJson(response, 403, "unauthorized access"), (error) => {
    assert.doesNotMatch(error.message, /test-secret-that-must-not-be-logged/);
    assert.equal(error.actual, 200);
    return true;
  });
});
