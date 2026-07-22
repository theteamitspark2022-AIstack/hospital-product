// Stub env vars before any module loads
process.env.JWT_SECRET = "test-secret-key";
process.env.NODE_ENV = "test";

// Prevent the server from actually starting or connecting to DB
jest.mock("../src/models/db", () => ({
  query: jest.fn(),
  connect: jest.fn(),
  migrate: jest.fn(),
  isConnected: jest.fn(() => true),
}));

// Prevent reminder scheduler from starting
jest.mock("../src/services/reminderService", () => ({
  startReminderScheduler: jest.fn(),
  runReminderCheck: jest.fn(),
  sendReminder: jest.fn(),
}));
