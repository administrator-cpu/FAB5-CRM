const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const RESEND_API_KEY = process.env.RESEND_SERVICE_API_KEY;
if (!RESEND_API_KEY) {
  logger.warn("RESEND_SERVICE_API_KEY is missing from environment variables!");
}

const COMPANY_NAME = process.env.COMPANY_NAME || "FAB5 Network";
const CRM_EMAIL = process.env.CRM_EMAIL;

const buildCC = (...emails) => emails.filter(Boolean);

const buildHtmlTemplate = (htmlContent) => {
  const currentYear = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 0; background-color: #f4f4f4;">

    <div style="font-family: system-ui, Arial, sans-serif; font-size: 14px; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; color: #333;">

      <div style="line-height: 1.6;">
        ${htmlContent}
      </div>

      <div style=" margin-top: 32px; padding-top: 16px; border-top: 1px solid #eaeaea; text-align: center;">
        <a href="https://fab5network.com" target="_blank" style="text-decoration: none; outline: none;">
          <img src="https://res.cloudinary.com/drrour6hl/image/upload/v1774876669/crm/fab5-logo.webp"
            alt="FAB5 Network Private Limited"
            height="80"
            style="height: 80px; display: block; margin: 0 auto;"
          />
        </a>
        <p style="margin: 8px 0 4px; font-size: 12px; color: #999;">
          © ${currentYear} Fab Five Network Private Limited. All rights reserved.
        </p>
        <p style="margin: 0; font-size: 12px; color: #999;">
          <a href="https://fab5network.com" style="color: #999; text-decoration: none;">
            https://fab5network.com
          </a>
        </p>
      </div>

    </div>

  </body>
</html>`;
};

// ─── Base Sender ──────────────────────────────────────────────────────────────

/*
 * @param {string}        subject
 * @param {string}        htmlContent
 * @param {string|Array}  to
 * @param {string|Array}  [cc]
 * @param {string|Array}  [bcc]
 */
const sendViaEmailJS = async (subject, htmlContent, to, cc, bcc) => {
  const missing = [];
  if (!subject) missing.push("subject");
  if (!htmlContent) missing.push("htmlContent");
  if (!to) missing.push("to");

  if (missing.length > 0) {
    throw new AppError(`sendViaEmailJS missing required fields: ${missing.join(", ")}`, 400);
  }

  const normalizeEmail = (val) => {
    if (!val) return undefined;
    return Array.isArray(val) ? val.join(",") : val;
  };

  const toEmail = normalizeEmail(to);
  const ccEmail = normalizeEmail(cc);
  const bccEmail = normalizeEmail(bcc);

  logger.info("Sending email via Resend Microservice", {
    to: toEmail,
    subject,
  });

  try {
    const fullHtml = buildHtmlTemplate(htmlContent);
    const textFallback = htmlContent.replace(/<[^>]+>/g, ' ');
    const payload = {
      to: toEmail,
      subject: subject,
      html: fullHtml,
      text: textFallback,
      fromName: COMPANY_NAME
    };

    if (ccEmail) payload.cc = ccEmail;
    if (bccEmail) payload.bcc = bccEmail;
    const response = await fetch("https://mailing-hxzo.onrender.com/api/send-email", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend Microservice Error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    logger.error("Failed to send email via Resend Microservice", {
      error: error.message
    });
    throw error;
  }

};

// ─── Email Templates ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = {
  // ── Connection Lifecycle ──────────────────────────────────────────────────

  WELCOME: (connection) => ({
    subject: "Welcome & Opportunity Created",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        Thank you for submitting your order details. We're pleased to inform you that 
        your order has been successfully registered in our system.
      </p>
      <p>Your Opportunity ID is: <strong>${connection.opportunityId}</strong></p>
      <p>
        Commercial team will review your order and get in touch with you shortly.
      </p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  WELCOME_BULK: (data) => {
    const idList = data.opportunityIds.map(id => `<li><strong>${id}</strong></li>`).join("");

    return {
      subject: `Welcome & Opportunity Created (${data.opportunityIds.length} Connections)`,
      htmlContent: `
        <p>Dear Sir/Madam,</p>
        <p>Greetings from ${COMPANY_NAME}!!</p>
        <p>
          Thank you for submitting your order details. We're pleased to inform you that 
          your following order has been successfully placed in our system:
        </p>
        <ul>${idList}</ul>
        <p>
          Commercial team will review your order and get in touch with you shortly.
        </p>
        <br/>
        <p>Sincerely,</p>
        <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
      `,
    }
  },

  ORDER_APPROVED: (connection) => ({
    subject: "Order Approved by Commercial Team",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        We are pleased to inform you that the order with 
        <strong>Opportunity ID: ${connection.opportunityId}</strong> has been approved 
        by the Commercial Team.
      </p>
      <p>
        We now proceed with the next steps for execution and fulfillment of the order.
      </p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  ORDER_REJECTED: (connection) => ({
    subject: "Order Rejected by Commercial Team",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        This is to inform you that the order with 
        <strong>Opportunity ID: ${connection.opportunityId}</strong> has been reviewed 
        and rejected by the Commercial Team.
      </p>
      <p>
        We request you to review the details and take necessary action accordingly. 
        Please connect with the Commercial Team if further clarification is required.
      </p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  ORDER_GENERATED: (connection) => ({
    subject: "Order Placed with Upstream – Under Implementation",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        This is to inform you that the order with 
        <strong>Opportunity ID: ${connection.opportunityId}</strong> has been successfully 
        placed with the upstream and is now under implementation.
      </p>
      <p>
        We request you to kindly coordinate with the Project Manager for further updates, 
        support, and any assistance required during the implementation phase.
      </p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  BULK_ORDER_GENERATED: (data) => {
    const idList = data.opportunityIds.map(id => `<li><strong>${id}</strong></li>`).join("");

    return {
      subject: `Orders Placed with Upstream (${data.opportunityIds.length} Connections) - Under Implementation`,
      htmlContent: `
        <p>Dear Sir/Madam,</p>
        <p>Greetings from ${COMPANY_NAME}!!</p>
        <p>
          This is to inform you that the following orders have been successfully 
          placed with the upstream and are now under implementation:
        </p>
        <ul>${idList}</ul>
        <p>
          We request you to kindly coordinate with the Project Manager for further updates, 
          support, and any assistance required during the implementation phase.
        </p>
        <br/>
        <p>Sincerely,</p>
        <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
      `,
    }
  },

  ACTIVATED: (connection) => ({
    subject: "Order Successfully Delivered – Congrats!!",
    htmlContent: `
    <p>Dear Sir/Madam,</p>
    <p>Greetings from ${COMPANY_NAME}!!</p>
    <p>
      We are pleased to inform you that the order with 
      <strong>Opportunity ID: ${connection.opportunityId}</strong> has been successfully 
      delivered and updated to the billing team.
    </p>
    <br/>
    <p>Sincerely,</p>
    <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
  `,
  }),

  CANCELLED: (connection) => ({
    subject: "Order Cancelled – Oops!!",
    htmlContent: `
    <p>Dear Sir/Madam,</p>
    <p>Greetings from ${COMPANY_NAME}!!</p>
    <p>
      We regret to inform you that the order with 
      <strong>Opportunity ID: ${connection.opportunityId}</strong> has been cancelled 
      due to the following reason:
    </p>
    <p><strong>Reason:</strong> ${connection.reason}</p>
    <p>
      Please coordinate with the Project team if any further clarification 
      or next steps are required.
    </p>
    <br/>
    <p>Sincerely,</p>
    <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
  `,
  }),

  // ────────────────── Upgrade / Downgrade ───────────────────
  UPGRADE: (connection) => ({
    subject: "Bandwidth Change Request Submitted",
    htmlContent: `
    <p>Dear Sir/Madam,</p>
    <p>Greetings from ${COMPANY_NAME}!!</p>
    <p>
      Thank you for submitting your bandwidth change request for 
      <strong>Opportunity ID: ${connection.opportunityId}</strong>. 
      We're pleased to inform you that your request has been successfully registered.
    </p>
    <br/>
    <table style="border-collapse: collapse;">
      <tr>
        <td style="padding-right: 40px;">
          <strong>Old Bandwidth:</strong> ${connection.oldBandwidth}
        </td>
        <td>
          <strong>New Bandwidth:</strong> ${connection.newBandwidth}
        </td>
      </tr>
    </table>
    <br/>
    <p>
      Our Commercial team will review the request and get back to you 
      shortly with the next steps.
    </p>
    <br/>
    <p>Sincerely,</p>
    <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
  `,
  }),

  DOWNGRADE: (connection) => ({
    subject: "Bandwidth Change Request Submitted",
    htmlContent: `
    <p>Dear Sir/Madam,</p>
    <p>Greetings from ${COMPANY_NAME}!!</p>
    <p>
      Thank you for submitting your bandwidth change request for 
      <strong>Opportunity ID: ${connection.opportunityId}</strong>. 
      We're pleased to inform you that your request has been successfully registered.
    </p>
    <br/>
    <table style="border-collapse: collapse;">
      <tr>
        <td style="padding-right: 40px;">
          <strong>Old Bandwidth:</strong> ${connection.oldBandwidth}
        </td>
        <td>
          <strong>New Bandwidth:</strong> ${connection.newBandwidth}
        </td>
      </tr>
    </table>
    <br/>
    <p>
      Our Commercial team will review the request and get back to you 
      shortly with the next steps.
    </p>
    <br/>
    <p>Sincerely,</p>
    <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
  `,
  }),

  // ────────────────────── Shifting ──────────────────────────────
  SHIFTING: (connection) => ({
    subject: "Shifting Request Submitted",
    htmlContent: `
    <p>Dear Sir/Madam,</p>
    <p>Greetings from ${COMPANY_NAME}!!</p>
    <p>
      Thank you for submitting your shifting request for 
      <strong>Opportunity ID: ${connection.opportunityId}</strong>. 
      We're pleased to inform you that your request has been successfully registered.
    </p>
    <br/>
    <table style="border-collapse: collapse;">
      <tr>
        <td style="padding-right: 40px;">
          <strong>Current A End:</strong> ${connection.currentAEnd}
        </td>
        <td>
          <strong>New A End:</strong> ${connection.newAEnd}
        </td>
      </tr>
      <tr>
        <td style="padding-right: 40px; padding-top: 8px;">
          <strong>Current B End:</strong> ${connection.currentBEnd}
        </td>
        <td style="padding-top: 8px;">
          <strong>New B End:</strong> ${connection.newBEnd}
        </td>
      </tr>
    </table>
    <br/>
    <p>
      Our Commercial team will review the request and get back to you 
      shortly with the next steps.
    </p>
    <br/>
    <p>Sincerely,</p>
    <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
  `,
  }),

  // ── Disconnection Lifecycle ───────────────────────────────────────────────
  DISCONNECTION: (connection) => ({
    subject: "Disconnection Notification",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        This is to acknowledge that we have received your Disconnection Request for the
        <strong>Opportunity ID: ${connection.opportunityId}</strong> submitted through the CRM.
        If you wish to cancel or extend your disconnection request, kindly do so at least
        five days before the disconnection date.
      </p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  RETENTION: (connection) => ({
    subject: "Service Continuation Notification",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        In accordance with your request to cancel the Disconnection of
        <strong>Opportunity ID: ${connection.opportunityId}</strong>, we are pleased to inform you
        that the link will remain operational and billing will proceed as usual.
      </p>
      <p>We value your association with us and look forward to serving you.</p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  EXTENSION: (connection) => ({
    subject: "Disconnection Extension Notification",
    htmlContent: `
      <p>Dear Sir/Madam,</p>
      <p>Greetings from ${COMPANY_NAME}!!</p>
      <p>
        This is to acknowledge that we have received a service extension of the disconnection
        request for the <strong>Opportunity ID: ${connection.opportunityId}</strong>, submitted
        through the CRM. If you wish to cancel or further extend your disconnection request,
        kindly do so at least five days before the final disconnection date.
      </p>
      <br/>
      <p>Earlier disconnection date: <strong>${connection.previousDisconnectionDate}</strong></p>
      <p>Current disconnection date: <strong>${connection.disconnectionDate}</strong></p>
      <br/>
      <p>Sincerely,</p>
      <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
    `,
  }),

  // ── Auth ──────────────────────────────────────────────────────────────────

  OTP: (otp) => ({
    subject: "Your Verification Code (OTP)",
    htmlContent: `
      <h2>Verification Code</h2>
      <div style="
        margin: 20px 0;
        padding: 15px;
        background-color: #f8f9fa;
        border-left: 5px solid #007bff;
      ">
        <span style="
          font-size: 24px;
          font-weight: bold;
          letter-spacing: 5px;
          color: #333;
        ">
          ${otp}
        </span>
      </div>
      <p>This code expires in 10 minutes. Do not share it with anyone.</p>
      <p style="color: #666; font-size: 12px;">
        If you did not request this code, please contact admin.
      </p>
    `,
  }),
};

// ─── Valid Type Maps ──────────────────────────────────────────────────────────

const CONNECTION_TYPES = ["WELCOME", "WELCOME_BULK", "ORDER_APPROVED", "ORDER_REJECTED", "ORDER_GENERATED", "ACTIVATED", "CANCELLED", "BULK_ORDER_GENERATED"];
const DISCONNECTION_TYPES = ["DISCONNECTION", "RETENTION", "EXTENSION"];
const CHANGE_TYPES = ["UPGRADE", "DOWNGRADE", "SHIFTING"];

// ─── Public Functions ─────────────────────────────────────────────────────────
const sendOTPEmail = async (email, otp) => {
  if (!email || !otp) {
    throw new AppError("email and otp are required", 400);
  }

  const { subject, htmlContent } = EMAIL_TEMPLATES.OTP(otp);

  try {
    await sendViaEmailJS(subject, htmlContent, email);
    logger.info("✅ OTP email sent", { to: email });
    return true;
  } catch (error) {
    logger.error("❌ Failed to send OTP email", {
      to: email,
      error: error.message,
    });
    return false;
  }
};

const sendChangeEmail = async (type, connection, employee) => {
  if (!CHANGE_TYPES.includes(type)) {
    throw new AppError(`Invalid change email type: ${type}. Must be one of: ${CHANGE_TYPES.join(", ")}`, 400);
  }

  if (!employee?.email) throw new AppError("Employee email is required", 400);
  if (!connection?.opportunityId) throw new AppError("Connection opportunityId is required", 400);

  if (type === "UPGRADE" || type === "DOWNGRADE") {
    if (!connection.oldBandwidth || !connection.newBandwidth) {
      throw new AppError(`${type} requires oldBandwidth and newBandwidth`, 400);
    }
  }

  if (type === "SHIFTING") {
    const missing = ["currentAEnd", "newAEnd", "currentBEnd", "newBEnd"]
      .filter((key) => !connection[key]);
    if (missing.length > 0) {
      throw new AppError(`SHIFTING requires: ${missing.join(", ")}`, 400);
    }
  }

  const { subject, htmlContent } = EMAIL_TEMPLATES[type](connection);

  const createdByEmail = connection.createdBy?.email || null;
  const to = createdByEmail || CRM_EMAIL;

  try {
    await sendViaEmailJS(subject, htmlContent, to, null, null);
    logger.info(`✅ ${type} email sent`, { type, to });
  } catch (error) {
    logger.error(`❌ Failed to send ${type} email`, {
      type,
      to,
      error: error.message,
    });
    throw new AppError(`Failed to send ${type} email`, 500);
  }
};

const sendConnectionEmail = async (type, connection, employee) => {
  if (!CONNECTION_TYPES.includes(type)) {
    throw new AppError(`Invalid connection email type: ${type}. Must be one of: ${CONNECTION_TYPES.join(", ")}`, 400);
  }

  if (!employee?.email) throw new AppError("Employee email is required", 400);
  if (type === "BULK_ORDER_GENERATED" || type === "WELCOME_BULK") {
    if (!connection?.opportunityIds || connection.opportunityIds.length === 0) {
      throw new AppError(`Connection opportunityIds array is required for ${type} emails`, 400);
    }
  } else {
    if (!connection?.opportunityId) {
      throw new AppError("Connection opportunityId is required", 400);
    }
  }

  const { subject, htmlContent } = EMAIL_TEMPLATES[type](connection);

  const standardCreatedByEmail = connection.createdBy?.email || null;

  const toMap = {
    WELCOME: standardCreatedByEmail || CRM_EMAIL,
    WELCOME_BULK: connection.createdByEmail || CRM_EMAIL,
    ORDER_APPROVED: standardCreatedByEmail || CRM_EMAIL,
    ORDER_REJECTED: standardCreatedByEmail || CRM_EMAIL,
    ORDER_GENERATED: standardCreatedByEmail || CRM_EMAIL,
    ACTIVATED: standardCreatedByEmail || CRM_EMAIL,
    CANCELLED: standardCreatedByEmail || CRM_EMAIL,
    BULK_ORDER_GENERATED: connection.createdByEmail || CRM_EMAIL,
  };

  const to = toMap[type] || standardCreatedByEmail;

  try {
    await sendViaEmailJS(subject, htmlContent, to, null, null);
    logger.info(`✅ ${type} email sent`, { type, to });
  } catch (error) {
    logger.error(`❌ Failed to send ${type} email`, {
      type,
      to,
      error: error.message,
    });
    throw new AppError(`Failed to send ${type} email`, 500);
  }
};

const sendTransactionEmail = async (type, connection, employee) => {
  if (!DISCONNECTION_TYPES.includes(type)) {
    throw new AppError(`Invalid transaction email type: ${type}. Must be one of: ${DISCONNECTION_TYPES.join(", ")}`, 400);
  }

  if (!employee?.email) throw new AppError("Employee email is required", 400);
  if (!connection?.opportunityId) throw new AppError("Connection opportunityId is required", 400);

  if (type === "EXTENSION") {
    if (!connection.previousDisconnectionDate || !connection.disconnectionDate) {
      throw new AppError("EXTENSION type requires previousDisconnectionDate and disconnectionDate", 400);
    }
  }

  const { subject, htmlContent } = EMAIL_TEMPLATES[type](connection);

  const createdByEmail = connection.createdBy?.email || null;
  const to = createdByEmail || CRM_EMAIL;
  const bcc = buildCC(CRM_EMAIL);

  try {
    await sendViaEmailJS(subject, htmlContent, to, null, bcc);
    logger.info(`✅ ${type} email sent`, { type, to, bcc });
  } catch (error) {
    logger.error(`❌ Failed to send ${type} email`, {
      type,
      to,
      error: error.message,
    });
    throw new AppError(`Failed to send ${type} email`, 500);
  }
};

module.exports = {
  sendOTPEmail,
  sendConnectionEmail,
  sendTransactionEmail,
  sendChangeEmail,
  sendViaEmailJS
};
