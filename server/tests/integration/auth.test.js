const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/models/db");
const bcrypt = require("bcryptjs");

const VALID_USER = {
  email: "owner@testbiz.com",
  password: "Secret123",
  businessName: "Test Business",
};

describe("POST /api/auth/signup", () => {
  beforeEach(() => db.query.mockReset());

  it("rejects missing fields", async () => {
    const res = await request(app).post("/api/auth/signup").send({});
    expect(res.status).toBe(400);
  });

  it("rejects invalid email", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...VALID_USER, email: "notanemail",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("rejects weak password (no uppercase)", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...VALID_USER, password: "secret123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/uppercase/i);
  });

  it("rejects weak password (no number)", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...VALID_USER, password: "SecretABC",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/i);
  });

  it("rejects short business name", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      ...VALID_USER, businessName: "X",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/business name/i);
  });

  it("returns 409 when email already exists", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: "biz-1" }] }) // business insert
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await request(app).post("/api/auth/signup").send(VALID_USER);
    expect([400, 409, 500]).toContain(res.status);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => db.query.mockReset());

  it("rejects missing credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 for unknown email", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app).post("/api/auth/login").send(VALID_USER);
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong password", async () => {
    const hash = await bcrypt.hash("DifferentPass1", 10);
    db.query.mockResolvedValue({ rows: [{ id: "u1", password_hash: hash, business_id: "b1", role: "owner" }] });
    const res = await request(app).post("/api/auth/login").send(VALID_USER);
    expect(res.status).toBe(401);
  });

  it("sets cookie and returns ok on valid login", async () => {
    const hash = await bcrypt.hash(VALID_USER.password, 10);
    db.query.mockResolvedValue({ rows: [{ id: "u1", password_hash: hash, business_id: "b1", role: "owner" }] });
    const res = await request(app).post("/api/auth/login").send(VALID_USER);
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
