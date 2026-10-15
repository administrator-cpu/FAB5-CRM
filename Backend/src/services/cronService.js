const cron = require('node-cron');
const Connection = require('../models/connectionModel');
const logger = require('../utils/logger');
const { sendViaEmailJS } = require('../services/sendEmail');

const COMPANY_NAME = process.env.COMPANY_NAME || "FAB5 Network";

const terminationReminderTemplate = (connection) => ({
  subject: "Reminder: Termination Approaching",
  htmlContent: `
     <p>Dear Sir/Madam,</p>
    <p>Greetings from ${COMPANY_NAME}!!</p>
    <p>
      This is a reminder that the termination date for the 
      <strong>Opportunity ID: ${connection.opportunityId}</strong> is approaching.
    </p>
    <p>
      If you wish to retain or extend this opportunity, please take the necessary 
      action immediately in the CRM to avoid termination of the link.
    </p>
    <p>Kindly ensure this is addressed at the earliest.</p>
    <br/>
    <p>Sincerely,</p>
    <p>Customer Relationship Manager<br/>${COMPANY_NAME}</p>
  `,
});

const sendTerminationReminder = async (connection) => {
  const { subject, htmlContent } = terminationReminderTemplate(connection);
  const createdByEmail = connection.createdBy?.email;
  if (!createdByEmail) {
    logger.warn("Sale Person mail or customer email not found", {
      opportunityId: connection.opportunityId,
    });
    return; // Skip sending email
  }

  await sendViaEmailJS(subject, htmlContent, createdByEmail, null, null);

  logger.info("Termination reminder sent", {
    opportunityId: connection.opportunityId,
    to: createdByEmail,
    finalDate: connection.terminationDetails.finalDate,
  });
};

const startReminderJob = () => {
  if (process.env.ENABLE_CRON !== "true") {
    logger.info("Cron job is disabled on this environment");
    return;
  }
  // SCHEDULE: 12:00 PM exactly in Indian Standard Time
  cron.schedule('0 12 * * *', async () => {
    logger.info('⏳ Running Daily Termination Reminder...');

    try {
      const now = new Date();

      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      const endOf5thDay = new Date(now);
      endOf5thDay.setDate(endOf5thDay.getDate() + 5);
      endOf5thDay.setHours(23, 59, 59, 999);

      const connections = await Connection.find({
        status: 'Notice Period',
        "terminationDetails.finalDate": {
          $gte: startOfToday,
          $lte: endOf5thDay,
        },
      })
        .populate('createdBy', 'email name')
        .populate('customer', 'email name');

      if (connections.length === 0) {
        logger.info('✅ No reminders needed today.');
        return;
      }

      logger.info(`Found ${connections.length} connection(s) needing reminders`);

      for (const connection of connections) {
        try {
          await sendTerminationReminder(connection);
        } catch (error) {
          logger.error("❌ Failed to send reminder", {
            opportunityId: connection.opportunityId,
            error: error.message,
          });
        }
      }

      logger.info("✅ Termination reminder job completed");

    } catch (error) {
      logger.error("❌ Termination reminder job failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  logger.info("✅ Termination reminder cron scheduled — runs daily at 12:00 AM IST");
};

const startAutoTerminationJob = () => {
  if (process.env.ENABLE_CRON !== "true") {
    return;
  }

  cron.schedule('0 * * * *', async () => {
    logger.info('⏳ Running Hourly Auto-Termination Check...');

    try {
      const now = new Date();

      const expiredConnections = await Connection.find({
        status: 'Notice Period',
        "terminationDetails.finalDate": { $lte: now },
      });

      if (expiredConnections.length === 0) {
        logger.info('✅ No notice periods expired this hour.');
        return;
      }

      logger.info(`Found ${expiredConnections.length} connection(s) to terminate`);

      for (const connection of expiredConnections) {
        try {
          connection.status = "Disconnected";

          connection.history.push({
            action: "TERMINATED",
            note: "Auto-terminated at the end of notice period",
            date: new Date(),
            serviceType: connection.serviceType,
            bandwidth: connection.bandwidth
          });

          await connection.save();

          logger.info(`✅ Auto-terminated connection`, {
            opportunityId: connection.opportunityId
          });

        } catch (error) {
          logger.error("❌ Failed to auto-terminate connection", {
            opportunityId: connection.opportunityId,
            error: error.message,
          });
        }
      }

      logger.info("✅ Hourly auto-termination job completed");

    } catch (error) {
      logger.error("❌ Auto-termination job crashed", {
        error: error.message,
      });
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  logger.info("✅ Auto-termination cron scheduled — runs hourly");
};

const startRateRevisionJob = () => {
  if (process.env.ENABLE_CRON !== "true") {
    return;
  }

  cron.schedule('15 0 * * *', async () => {
    logger.info('⏳ Running Daily Scheduled Rate Revision Check...');

    try {
      const now = new Date();

      const connections = await Connection.find({
        status: "Active",
        "scheduledRateRevision.effectiveDate": { $lte: now, $ne: null }
      });

      if (connections.length === 0) {
        logger.info('✅ No scheduled rate revisions to apply today.');
        return;
      }

      logger.info(`Found ${connections.length} connection(s) to apply rate revisions`);

      for (const connection of connections) {
        try {
          const { mrc, ratePerMb } = connection.scheduledRateRevision;
          const oldMrc = connection.commercials.mrc;

          connection.commercials.mrc = mrc;
          connection.commercials.ratePerMb = ratePerMb;

          const formattedOldMrc = new Intl.NumberFormat("en-IN").format(oldMrc);
          const formattedNewMrc = new Intl.NumberFormat("en-IN").format(mrc);

          connection.scheduledRateRevision = undefined;

          connection.history.push({
            action: "ACTIVATED",
            date: new Date(),
            note: `Rate Revision Applied Automatically. (MRC: ₹${formattedOldMrc} → ₹${formattedNewMrc})`,
            commercials: connection.commercials,
            bandwidth: connection.bandwidth,
            serviceType: connection.serviceType,
            ips: connection.ips,
            providerCost: { mrc: connection.providerCost?.mrc, ratePerMb: connection.providerCost?.ratePerMb },
            technicalDetails: connection.technicalDetails,
            terminationDetails: connection.terminationDetails
          });

          await connection.save();

          logger.info(`✅ Rate revision applied successfully`, {
            opportunityId: connection.opportunityId
          });

        } catch (error) {
          logger.error("❌ Failed to apply rate revision", {
            opportunityId: connection.opportunityId,
            error: error.message,
          });
        }
      }

      logger.info("✅ Rate revision job completed");

    } catch (error) {
      logger.error("❌ Rate revision job crashed", {
        error: error.message,
      });
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  logger.info("✅ Scheduled Rate Revision cron initialized — runs daily at 12:15 AM IST");
};

module.exports = { startReminderJob, startAutoTerminationJob, startRateRevisionJob };