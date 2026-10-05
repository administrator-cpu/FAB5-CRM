const { generateCustomerPoPdf } = require("../utils/poGenerator");
const { uploadDocument } = require("./upload.service");
const { documentFileName } = require("../utils/pdfLayout");

/**
 * Generates the customer Purchase Order PDF for a new connection and stores it with the active storage driver.
 * @param {object} params
 * @param {string} params.opportunityId - opportunity number, used in the file name
 * @param {object} params.customer - Customer document
 * @param {object} [params.billing] - billing profile chosen for this order
 * @param {object} params.connection - { serviceType, bandwidth, mrc, otc, aEndBtsId, aEndAddress, bEndBtsId, bEndAddress, ipCount }
 * @returns {Promise<{fileName: string, url: string, publicId: string, storage: string}>} entry for Connection.purchaseOrders
 */
const createGeneratedPo = async ({ opportunityId, customer, billing, connection }) => {
  const pdf = await generateCustomerPoPdf({ customer, billing, connection });

  const uploaded = await uploadDocument(
    { buffer: pdf, mimetype: "application/pdf", size: pdf.length },
    "crm/connections/purchaseOrders",
  );

  return { fileName: documentFileName(customer.name, opportunityId, "PO"), ...uploaded };
};

module.exports = { createGeneratedPo };