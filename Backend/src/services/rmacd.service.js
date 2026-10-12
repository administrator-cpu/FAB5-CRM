const { generateRmacdPdf } = require("../utils/rmacdGenerator");
const { uploadDocument } = require("./upload.service");
const { documentFileName } = require("../utils/pdfLayout");

/**
 * Generates the unsigned RMACD (Charge Deviation Form) for a change request and stores it
 * with the active storage driver.
 * @param {object} params
 * @param {object} params.customer - Customer document
 * @param {object} params.form - data for generateRmacdPdf (requestType, opportunityId, bandwidth, mrc, …)
 * @returns {Promise<{fileName: string, url: string, publicId: string, storage: string, generatedAt: Date}>}
 */
const createGeneratedRmacd = async ({ customer, form }) => {
  const pdf = await generateRmacdPdf({ ...form, customerName: customer?.name });

  const uploaded = await uploadDocument(
    { buffer: pdf, mimetype: "application/pdf", size: pdf.length },
    "crm/connections/rmacd",
  );

  return {
    fileName: documentFileName(customer?.name, form.opportunityId, `RMACD_${form.requestType}`),
    ...uploaded,
    generatedAt: new Date(),
  };
};

module.exports = { createGeneratedRmacd };
