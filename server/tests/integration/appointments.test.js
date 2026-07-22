const request = require("supertest");
const app = require("../../src/app");
const db = require("../../src/models/db");
const jwt = require("jsonwebtoken");

function authCookie(role = "owner") {
  const token = jwt.sign(
    { userId: "u1", businessId: "b1", role },
    process.env.JWT_SECRET
  );
  return `avc_token=${token}`;
}

const futureDate = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 days from now

describe("POST /api/appointments", () => {
  beforeEach(() => db.query.mockReset());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/appointments").send({});
    expect(res.status).toBe(401);
  });

  it("rejects missing customerNumber", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", authCookie())
      .send({ appointmentAt: futureDate });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer number/i);
  });

  it("rejects phone number without + prefix", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", authCookie())
      .send({ customerNumber: "00447911123456", appointmentAt: futureDate });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/international format/i);
  });

  it("rejects phone without + prefix", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", authCookie())
      .send({ customerNumber: "07911123456", appointmentAt: futureDate });
    expect(res.status).toBe(400);
  });

  it("rejects past appointment date", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", authCookie())
      .send({ customerNumber: "+447911123456", appointmentAt: "2020-01-01T10:00:00Z" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/i);
  });

  it("rejects name over 128 chars", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", authCookie())
      .send({ customerNumber: "+447911123456", appointmentAt: futureDate, customerName: "A".repeat(129) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/128/);
  });

  it("creates appointment with valid data", async () => {
    const mock = { id: 1, customer_number: "+447911123456", status: "confirmed" };
    db.query.mockResolvedValue({ rows: [mock] });
    const res = await request(app)
      .post("/api/appointments")
      .set("Cookie", authCookie())
      .send({ customerNumber: "+447911123456", appointmentAt: futureDate, customerName: "John Smith" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("confirmed");
  });
});

describe("GET /api/appointments", () => {
  beforeEach(() => db.query.mockReset());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/appointments");
    expect(res.status).toBe(401);
  });

  it("returns list for authenticated user", async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, status: "confirmed" }] });
    const res = await request(app)
      .get("/api/appointments")
      .set("Cookie", authCookie());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("DELETE /api/appointments/:id", () => {
  beforeEach(() => db.query.mockReset());

  it("cancels appointment", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .delete("/api/appointments/1")
      .set("Cookie", authCookie());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
