const crypto = require("crypto");

const generateOpportunityId = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(crypto.randomInt(chars.length));
  }

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();

  const datePart = `${dd}${mm}${yyyy}`;

  return `FAB${datePart}${suffix}`;
};

module.exports = generateOpportunityId;
