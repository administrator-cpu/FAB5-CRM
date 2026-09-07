const buildBillingTimeline = (connection) => {
  const history = [...(connection.history || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

  const timeline = [];
  let activeState = { bandwidth: null, ratePerMb: null };
  let pendingTransaction = null;
  let activeNoticePeriod = null;

  for (const log of history) {
    const action = log.action;

    if (['CREATED', 'UPGRADE', 'DOWNGRADE', 'RATE_REVISION'].includes(action)) {
      pendingTransaction = { type: action, initiatedOn: log.date, approvedOn: null };
    }
    if (['APPROVED', 'RATE_REVISION_APPROVED'].includes(action) && pendingTransaction) {
      pendingTransaction.approvedOn = log.date;
    }
    if (['CANCELLED', 'REJECTED'].includes(action)) {
      pendingTransaction = null;
    }

    if (action === 'ACTIVATED') {
      const liveBandwidth = log.bandwidth || connection.bandwidth;
      const liveRate = log.commercials?.ratePerMb || connection.commercials?.ratePerMb;

      if (pendingTransaction && pendingTransaction.type !== 'CREATED') {
        timeline.push({
          type: pendingTransaction.type,
          initiatedOn: pendingTransaction.initiatedOn,
          approvedOn: pendingTransaction.approvedOn,
          activatedOn: log.date,
          previous: { ...activeState },
          revised: { bandwidth: liveBandwidth, ratePerMb: liveRate }
        });
      } else if (pendingTransaction?.type === 'CREATED' || timeline.length === 0) {
        timeline.push({
          type: 'ACTIVATED',
          acceptedOn: connection.acceptanceDate,
          activatedOn: log.date,
          bandwidth: liveBandwidth,
          ratePerMb: liveRate,
          serviceType: log.serviceType || connection.serviceType
        });
      }

      activeState = { bandwidth: liveBandwidth, ratePerMb: liveRate };
      pendingTransaction = null;
    }

    if (action === 'DISCONNECT_INITIATED' || action === 'NOTICE_PERIOD') {
      activeNoticePeriod = {
        type: 'NOTICE_PERIOD',
        raisedOn: log.date,
        finalDate: log.terminationDetails?.finalDate || connection.terminationDetails?.finalDate,
        extensions: [],
        _resolvedOn: null
      };
      timeline.push(activeNoticePeriod);
    }

    if (action === 'EXTENDED' && activeNoticePeriod) {
      activeNoticePeriod.extensions.push({
        date: log.date,
        revisedEndDate: log.terminationDetails?.finalDate || connection.terminationDetails?.finalDate
      });
    }

    if (action === 'TERMINATED') {
      if (activeNoticePeriod) activeNoticePeriod._resolvedOn = log.date;
      timeline.push({
        type: 'DISCONNECTED',
        raisedOn: log.terminationDetails?.raiseDate || connection.terminationDetails?.raiseDate,
        finalDate: log.date
      });
      activeNoticePeriod = null;
    }

    if (action === 'RETAINED') {
      if (activeNoticePeriod) activeNoticePeriod._resolvedOn = log.date;
      timeline.push({ type: 'RETAINED', retainedOn: log.date });
      activeNoticePeriod = null;
    }
  }

  timeline.push({
    type: 'CURRENT_STATE',
    acceptanceDate: connection.acceptanceDate,
    bandwidth: connection.bandwidth,
    ratePerMb: connection.commercials?.ratePerMb
  });

  return timeline;
};

module.exports = { buildBillingTimeline };