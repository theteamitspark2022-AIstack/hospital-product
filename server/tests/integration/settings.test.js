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

const VALID_SETTINGS = {
  businessName: "Test Clinic",
  callbackNumber: "+447911123456",
  sector: "Healthcare",
  country: "UK",
  missedCallTemplate: "Hi, you called {HOSPITAL_NAME}. We'll call you back shortly.",
};

describe("GET /api/settings", () => {
  beforeEach(() => db.query.mockReset());

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("returns settings for authenticated user", async () => {
    db.query.mockResolvedValue({ rows: [{ business_name: "Test", callback_number: "+447911123456", sector: "Healthcare", country: "UK", missed_call_template: "Hi {HOSPITAL_NAME}" }] });
    const res = await request(app).get("/api/settings").set("Cookie", authCookie());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("businessName");
  });
});

describe("POST /api/settings", () => {
  beforeEach(() => db.query.mockReset());

  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/settings").send(VALID_SETTINGS);
    expect(res.status).toBe(401);
  });

  it("rejects short business name", async () => {
    const res = await request(app)
      .post("/api/settings")
      .set("Cookie", authCookie())
      .send({ ...VALID_SETTINGS, businessName: "X" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/business name/i);
  });

  it("rejects phone number without + prefix", async () => {
    const res = await request(app)
      .post("/api/settings")
      .set("Cookie", authCookie())
      .send({ ...VALID_SETTINGS, callbackNumber: "00447911123456" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/international format/i);
  });

  it("rejects template missing {HOSPITAL_NAME}", async () => {
    const res = await request(app)
      .post("/api/settings")
      .set("Cookie", authCookie())
      .send({ ...VALID_SETTINGS, missedCallTemplate: "Hi, we missed your call." });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\{HOSPITAL_NAME\}/);
  });

  it("saves valid settings", async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post("/api/settings")
      .set("Cookie", authCookie())
      .send(VALID_SETTINGS);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
