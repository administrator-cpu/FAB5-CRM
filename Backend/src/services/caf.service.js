const { generateCafPdf, generateBulkCafPdf } = require("../utils/cafGenerator");
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

  // pageCount / signatureBoxes let eSign put the stamp on the CAF's own signature lines.
  return {
    fileName: documentFileName(customer.name, opportunityId, "CAF"),
    ...uploaded,
    pageCount: pdf.pageCount,
    signatureBoxes: pdf.signatureBoxes,
  };
};

/**
 * Generates the single CAF covering every connection of a bulk upload and stores it.
 * @param {object} params
 * @param {string} params.batchNumber - CAF number for the batch
 * @param {object} params.customer - Customer document
 * @param {object} [params.billing] - billing profile to print (defaults to the customer's first profile)
 * @param {object[]} params.connections - one entry per connection, same fields as createGeneratedCaf's connection plus opportunityId
 * @returns {Promise<{fileName: string, url: string, publicId: string, storage: string}>}
 */
const createGeneratedBulkCaf = async ({ batchNumber, customer, billing, connections }) => {
  const pdf = await generateBulkCafPdf({
    batchNumber,
    customer,
    billing: billing || customer.billingProfile?.[0],
    connections,
  });

  const uploaded = await uploadDocument(
    { buffer: pdf, mimetype: "application/pdf", size: pdf.length },
    "crm/connections/cafs",
  );

  return {
    fileName: documentFileName(customer.name, batchNumber, "CAF"),
    ...uploaded,
    pageCount: pdf.pageCount,
    signatureBoxes: pdf.signatureBoxes,
  };
};

module.exports = { createGeneratedCaf, createGeneratedBulkCaf };
