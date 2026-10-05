const { generateCafPdf } = require("../utils/cafGenerator");
const { uploadDocument } = require("./upload.service");
const { documentFileName } = require("../utils/pdfLayout");

/**
 * Generates the CAF PDF for a new connection and stores it with the active storage driver.
 * @param {object} params
 * @param {string} params.opportunityId - CAF number (the connection's opportunity id)
 * @param {object} params.customer - Customer document
 * @param {object} [params.billing] - billing profile to print (defaults to the customer's first profile)
 * @param {object} params.connection - { serviceType, bandwidth, ratePerMb, aEndBtsId, aEndAddress, bEndBtsId, bEndAddress, ipCount }
 * @returns {Promise<{fileName: string, url: string, publicId: string, storage: string}>} value for Connection.caf
 */
const createGeneratedCaf = async ({ opportunityId, customer, billing, connection }) => {
  const pdf = await generateCafPdf({
    opportunityId,
    customer,
    billing: billing || customer.billingProfile?.[0],
    connection,
  });

  const uploaded = await uploadDocument(
    { buffer: pdf, mimetype: "application/pdf", size: pdf.length },
    "crm/connections/cafs",
  );

  return { fileName: documentFileName(customer.name, opportunityId, "CAF"), ...uploaded };
};

module.exports = { createGeneratedCaf };
