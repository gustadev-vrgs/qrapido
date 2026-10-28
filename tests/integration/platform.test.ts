import assert from "node:assert/strict";
import test from "node:test";

import { GET as listRestaurants, POST as createRestaurant } from "@/app/api/platform/restaurants/route";

import { fakeAuth, fakeDb } from "../fakes/firebase-admin";
import { json, ORIGIN, seedRestaurant } from "./helpers";
import { NextRequest } from "next/server";

const OWNER = "dono@plataforma.com";
process.env.PLATFORM_ADMIN_EMAILS = OWNER;

const request = (token: string, body?: unknown) => new NextRequest(`${ORIGIN}/api/platform/restaurants`, {
  method: body === undefined ? "GET" : "POST",
  headers: { authorization: `Bearer test-token:${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const newRestaurant = { restaurantName: "Cantina da Ana", restaurantId: "cantina-da-ana", adminName: "Ana", adminEmail: "ana@cantina.com", adminPassword: "senhaforte1" };

test("dono da plataforma cadastra restaurante com administrador e configurações", async () => {
  seedRestaurant();
  const response = await createRestaurant(request(`owner-uid|${OWNER}|verified`, newRestaurant));
  const body = await json(response);
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(fakeDb.all("restaurants").find((item) => item.id === "cantina-da-ana")!.name, "Cantina da Ana");
  assert.ok(fakeDb.all("restaurantSettings").some((item) => item.restaurantId === "cantina-da-ana"), "configurações padrão criadas");
  const staff = fakeDb.all("staffUsers").find((item) => item.id === body.uid)!;
  assert.equal(staff.role, "admin");
  assert.equal(staff.restaurantId, "cantina-da-ana");
  assert.equal(fakeAuth.users.get(body.uid)!.password, "senhaforte1");

  const listed = await json(await listRestaurants(request(`owner-uid|${OWNER}|verified`)));
  assert.ok(listed.restaurants.some((item: { id: string; team: number }) => item.id === "cantina-da-ana" && item.team === 1));

  assert.equal((await createRestaurant(request(`owner-uid|${OWNER}|verified`, { ...newRestaurant, adminEmail: "outra@x.com" }))).status, 409, "identificador repetido");
});

test("só o e-mail da plataforma, confirmado, entra; e-mail de outro restaurante é recusado", async () => {
  seedRestaurant();
  assert.equal((await listRestaurants(request("admin-uid-123"))).status, 403, "administrador de restaurante não é dono da plataforma");
  assert.equal((await listRestaurants(request(`owner-uid|${OWNER}`))).status, 403, "e-mail não confirmado");
  const login = await fakeAuth.createUser({ email: "gerente@outro.com", password: "qualquer123" });
  await fakeDb.collection("staffUsers").doc(login.uid).set({ uid: login.uid, email: "gerente@outro.com", role: "manager", restaurantId: "rest-demo", isActive: true });
  const taken = await createRestaurant(request(`owner-uid|${OWNER}|verified`, { ...newRestaurant, restaurantId: "outro", adminEmail: "gerente@outro.com" }));
  assert.equal(taken.status, 409);
  assert.equal(fakeAuth.users.get(login.uid)!.password, "qualquer123", "senha de conta existente não muda");
  assert.equal(fakeDb.all("restaurants").some((item) => item.id === "outro"), false, "nada foi criado");
});
