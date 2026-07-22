const PLANS = {
  trial: {
    label: "Trial",
    agents: 1,
    callsPerMonth: 50,
    whatsapp: true,
    calendar: false,
    analytics: false,
  },
  starter: {
    label: "Starter",
    agents: 2,
    callsPerMonth: 200,
    whatsapp: true,
    calendar: false,
    analytics: false,
  },
  growth: {
    label: "Growth",
    agents: 5,
    callsPerMonth: 1000,
    whatsapp: true,
    calendar: true,
    analytics: true,
  },
  pro: {
    label: "Pro",
    agents: Infinity,
    callsPerMonth: Infinity,
    whatsapp: true,
    calendar: true,
    analytics: true,
  },
};

function getPlan(planKey) {
  return PLANS[planKey] || PLANS.trial;
}

module.exports = { PLANS, getPlan };
