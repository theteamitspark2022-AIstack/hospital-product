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

describe("POST /api/tickets", () => {
  beforeEach(() => db.query.mockReset());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/tickets").send({ customerNumber: "+447911123456" });
    expect(res.status).toBe(401);
  });

  it("rejects missing customerNumber", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", authCookie())
      .send({ priority: "P1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer number/i);
  });

  it("rejects invalid priority", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", authCookie())
      .send({ customerNumber: "+447911123456", priority: "HIGH" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });

  it("rejects description over 1000 chars", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", authCookie())
      .send({ customerNumber: "+447911123456", description: "x".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1000/);
  });

  it("creates ticket with valid data", async () => {
    const mockTicket = { id: 1, customer_number: "+447911123456", priority: "P2", status: "open" };
    db.query.mockResolvedValue({ rows: [mockTicket] });
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", authCookie())
      .send({ customerNumber: "+447911123456", priority: "P2", description: "Test issue" });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe("P2");
  });
});

describe("GET /api/tickets", () => {
  beforeEach(() => db.query.mockReset());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(401);
  });

  it("returns ticket list for authenticated user", async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, status: "open", priority: "P1" }] });
    const res = await request(app)
      .get("/api/tickets")
      .set("Cookie", authCookie());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("PATCH /api/tickets/:id", () => {
  beforeEach(() => db.query.mockReset());

  it("resolves a ticket", async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, status: "resolved" }] });
    const res = await request(app)
      .patch("/api/tickets/1")
      .set("Cookie", authCookie())
      .send({ status: "resolved" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("resolved");
  });

  it("returns 404 for unknown ticket", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .patch("/api/tickets/9999")
      .set("Cookie", authCookie())
      .send({ status: "resolved" });
    expect(res.status).toBe(404);
  });
});
