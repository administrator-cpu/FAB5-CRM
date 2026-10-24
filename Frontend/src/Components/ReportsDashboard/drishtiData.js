// Data rules shared by the Drishti dashboard and the Master Excel report.

// ─── Test accounts ─────────────────────────────────────────────────────────
// Anything created or managed by these accounts is test data: it is hidden from
// Drishti and the Master Report only. Every other page still shows it.
export const DRISHTI_EXCLUDED_EMAILS = ['administrator@fab5network.com'];

const normEmail = (email) => String(email || '').trim().toLowerCase();
const EXCLUDED_EMAILS = new Set(DRISHTI_EXCLUDED_EMAILS.map(normEmail));
export const isExcludedEmail = (email) => EXCLUDED_EMAILS.has(normEmail(email));

const refId = (ref) => (ref && typeof ref === 'object' ? ref._id || ref.id : ref);

/**
 * Removes test-account data from the /users/all payload:
 * - users with an excluded email
 * - customers managed by an excluded user
 * - connections created by an excluded user, or belonging to an excluded customer
 */
export const excludeTestData = (allData, currentUser) => {
  if (!allData) return allData;

  // References may be populated ({ _id, email }) or bare ids, so collect the ids too.
  const excludedUserIds = new Set(
    (allData.users || [])
      .filter((u) => isExcludedEmail(u.email))
      .map((u) => String(refId(u)))
  );
  if (currentUser && isExcludedEmail(currentUser.email)) {
    excludedUserIds.add(String(refId(currentUser)));
  }

  const isExcludedRef = (ref) => {
    if (!ref) return false;
    if (typeof ref === 'object' && isExcludedEmail(ref.email)) return true;
    const id = refId(ref);
    return id ? excludedUserIds.has(String(id)) : false;
  };

  const excludedCustomerIds = new Set();
  const customers = Array.isArray(allData.customers)
    ? allData.customers.filter((c) => {
        if (isExcludedRef(c.managedBy)) {
          excludedCustomerIds.add(String(c._id));
          return false;
        }
        return true;
      })
    : allData.customers;

  const connections = Array.isArray(allData.connections)
    ? allData.connections.filter((conn) => {
        if (isExcludedRef(conn.createdBy)) return false;
        const customerId = refId(conn.customer);
        return !(customerId && excludedCustomerIds.has(String(customerId)));
      })
    : allData.connections;

  const users = Array.isArray(allData.users)
    ? allData.users.filter((u) => !isExcludedEmail(u.email))
    : allData.users;

  return { ...allData, users, customers, connections };
};

/** Removes test-account rows from the /connection/project-report payload. */
export const excludeTestPmData = (pmData) =>
  Array.isArray(pmData) ? pmData.filter((row) => !isExcludedEmail(row.createdByEmail)) : pmData;

// ─── Notice Period proration ───────────────────────────────────────────────
/**
 * Share of the current calendar month's price a connection earns.
 * - Not in Notice Period, or no termination date → 1 (full month)
 * - Termination date in a later month → 1 (runs the whole month)
 * - Termination date inside this month → days it runs / days in month
 *   (the termination day itself counts, e.g. ends 28 Oct → 28/31)
 * - Termination date before this month → 0 (the hourly job disconnects these anyway)
 */
export const getMonthShare = (conn, now = new Date()) => {
  if (conn?.status !== 'Notice Period') return 1;

  const raw = conn.terminationDetails?.finalDate;
  if (!raw) return 1;
  const finalDate = new Date(raw);
  if (isNaN(finalDate.getTime())) return 1;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  if (finalDate >= nextMonthStart) return 1;
  if (finalDate < monthStart) return 0;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return finalDate.getDate() / daysInMonth;
};
