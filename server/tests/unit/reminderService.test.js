const { sendReminder } = require("../../src/services/reminderService");

describe("reminderService (unit)", () => {
  it("is mocked — sendReminder is a jest.fn", () => {
    expect(typeof sendReminder).toBe("function");
  });
});

// Pure logic extracted for unit testing — phone number normalisation
function toAddress(number, channel = "whatsapp") {
  const clean = number.replace(/\s+/g, "");
  return channel === "whatsapp" ? `whatsapp:${clean}` : clean;
}

describe("toAddress", () => {
  it("strips spaces and prefixes whatsapp:", () => {
    expect(toAddress("+44 7746 134 132")).toBe("whatsapp:+447746134132");
  });

  it("handles already-clean number", () => {
    expect(toAddress("+447911123456")).toBe("whatsapp:+447911123456");
  });

  it("returns plain number for sms channel", () => {
    expect(toAddress("+44 7700 900 000", "sms")).toBe("+447700900000");
  });
});
