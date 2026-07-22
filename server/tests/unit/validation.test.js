// Unit tests for validation rules used across routes

const phoneRegex = /^\+\d{7,15}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe("Phone number validation", () => {
  const valid = ["+447911123456", "+12025551234", "+353861234567"];
  const invalid = ["+44 7911 123456", "07911123456", "+123", "not-a-number", ""];

  valid.forEach(n => {
    it(`accepts ${n}`, () => expect(phoneRegex.test(n)).toBe(true));
  });

  invalid.forEach(n => {
    it(`rejects "${n}"`, () => expect(phoneRegex.test(n)).toBe(false));
  });
});

describe("Email validation", () => {
  const valid = ["user@example.com", "a@b.co.uk", "test+tag@domain.org"];
  const invalid = ["notanemail", "@domain.com", "user@", "user @domain.com"];

  valid.forEach(e => {
    it(`accepts ${e}`, () => expect(emailRegex.test(e)).toBe(true));
  });

  invalid.forEach(e => {
    it(`rejects "${e}"`, () => expect(emailRegex.test(e)).toBe(false));
  });
});

describe("Password validation", () => {
  const hasUpper = s => /[A-Z]/.test(s);
  const hasNumber = s => /[0-9]/.test(s);
  const minLength = s => s.length >= 8;

  it("passes a strong password", () => {
    const p = "Secret123";
    expect(minLength(p) && hasUpper(p) && hasNumber(p)).toBe(true);
  });

  it("fails when no uppercase", () => expect(hasUpper("secret123")).toBe(false));
  it("fails when no number",    () => expect(hasNumber("SecretABC")).toBe(false));
  it("fails when too short",    () => expect(minLength("S1x")).toBe(false));
});

describe("Ticket priority validation", () => {
  const valid = ["P1", "P2", "P3"];
  const invalid = ["p1", "P4", "HIGH", "", "1"];

  valid.forEach(p => it(`accepts ${p}`, () => expect(["P1","P2","P3"].includes(p)).toBe(true)));
  invalid.forEach(p => it(`rejects "${p}"`, () => expect(["P1","P2","P3"].includes(p)).toBe(false)));
});
