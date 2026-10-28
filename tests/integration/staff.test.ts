import assert from "node:assert/strict";
import test from "node:test";

import { GET as listTeam, POST as changeTeam } from "@/app/api/admin/staff/route";

import { fakeAuth, fakeDb } from "../fakes/firebase-admin";
import { ADMIN_UID, json, KITCHEN_UID, RESTAURANT_ID, seedRestaurant, staffRequest } from "./helpers";

const create = (uid: string, body: Record<string, unknown>) => changeTeam(staffRequest("/api/admin/staff", uid, { action: "create", ...body }));

test("admin cadastra garçom pelo painel: cria o login e o cadastro na equipe", async () => {
  seedRestaurant();
  const response = await create(ADMIN_UID, { name: "Joana Garçonete", email: "Joana@Restaurante.com", password: "segredo1", role: "attendant" });
  const body = await json(response);
  assert.equal(response.status, 201);
  const authUser = fakeAuth.users.get(body.uid)!;
  assert.equal(authUser.email, "joana@restaurante.com");
  const staff = fakeDb.all("staffUsers").find((item) => item.id === body.uid)!;
  assert.equal(staff.uid, body.uid, "o documento usa o mesmo UID do login (as regras exigem)");
  assert.equal(staff.restaurantId, RESTAURANT_ID);
  assert.equal(staff.role, "attendant");
  assert.equal(staff.isActive, true);

  const listed = await json(await listTeam(staffRequest("/api/admin/staff", ADMIN_UID, undefined, "GET")));
  assert.ok(listed.team.some((member: { email: string }) => member.email === "joana@restaurante.com"));
  assert.equal(listed.team.find((member: { uid: string }) => member.uid === ADMIN_UID).isMe, true);
});

test("e-mail que já tem login no Firebase é vinculado à equipe", async () => {
  seedRestaurant();
  const existing = await fakeAuth.createUser({ email: "antigo@restaurante.com", password: "qualquer1" });
  const response = await create(ADMIN_UID, { name: "Antigo", email: "antigo@restaurante.com", password: "novasenha", role: "kitchen" });
  assert.equal(response.status, 201);
  assert.equal((await json(response)).reused, true);
  assert.equal(fakeAuth.users.get(existing.uid)!.password, "novasenha");
  assert.equal(fakeDb.all("staffUsers").find((item) => item.id === existing.uid)!.role, "kitchen");
  assert.equal((await create(ADMIN_UID, { name: "Antigo", email: "antigo@restaurante.com", password: "novasenha", role: "kitchen" })).status, 409, "não duplica quem já está ativo");
});

test("desativar, trocar função e senha; proteções contra ficar sem administrador", async () => {
  seedRestaurant();
  const { uid } = await json(await create(ADMIN_UID, { name: "Caio", email: "caio@r.com", password: "senha123", role: "attendant" }));
  assert.equal((await changeTeam(staffRequest("/api/admin/staff", ADMIN_UID, { action: "update", uid, role: "kitchen" }))).status, 200);
  assert.equal((await changeTeam(staffRequest("/api/admin/staff", ADMIN_UID, { action: "update", uid, isActive: false }))).status, 200);
  const caio = fakeDb.all("staffUsers").find((item) => item.id === uid)!;
  assert.equal(caio.role, "kitchen");
  assert.equal(caio.isActive, false);
  assert.equal(fakeAuth.users.get(uid)!.disabled, true);
  assert.ok(fakeAuth.users.get(uid)!.tokensRevokedAt, "desativado sai dos aparelhos");

  assert.equal((await changeTeam(staffRequest("/api/admin/staff", ADMIN_UID, { action: "password", uid, password: "nova1234" }))).status, 200);
  assert.equal(fakeAuth.users.get(uid)!.password, "nova1234");

  const selfOff = await changeTeam(staffRequest("/api/admin/staff", ADMIN_UID, { action: "update", uid: ADMIN_UID, isActive: false }));
  assert.equal(selfOff.status, 400, "não dá para desativar a si mesmo");
  const weak = await create(ADMIN_UID, { name: "Fraca", email: "fraca@r.com", password: "123", role: "attendant" });
  assert.equal(weak.status, 400);
});

test("gerente cuida do salão mas não cria administrador; cozinha não mexe na equipe", async () => {
  seedRestaurant();
  const { uid: managerUid } = await json(await create(ADMIN_UID, { name: "Gerente", email: "gerente@r.com", password: "senha123", role: "manager" }));
  assert.equal((await create(managerUid, { name: "Novo admin", email: "na@r.com", password: "senha123", role: "admin" })).status, 403);
  assert.equal((await create(managerUid, { name: "Garçom", email: "g@r.com", password: "senha123", role: "attendant" })).status, 201);
  assert.equal((await changeTeam(staffRequest("/api/admin/staff", managerUid, { action: "password", uid: ADMIN_UID, password: "hack1234" }))).status, 403);
  assert.equal((await listTeam(staffRequest("/api/admin/staff", KITCHEN_UID, undefined, "GET"))).status, 403);
});
