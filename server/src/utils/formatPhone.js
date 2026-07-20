function normalizeE164(number) {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  return digits.startsWith("0") ? `+44${digits.slice(1)}` : `+${digits}`;
}

module.exports = { normalizeE164 };
