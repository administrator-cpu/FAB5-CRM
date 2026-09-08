import { useEffect, useMemo, useState } from 'react';
import targetService, { getMonthStartISO, resolveMonthlyTarget } from '../../Services/targetService';

// Current month's Actual (bandwidth of connections created this month) vs
// Target (sum of employees' monthly targets, carrying forward the last
// value an admin set for any employee who has no explicit target this
// month). Shared by the KPI strip and the Alerts & Risk Center so both
// agree on the same number.
export const useSalesAchievement = (events = [], employees = []) => {
  const [allTargets, setAllTargets] = useState({});

  useEffect(() => {
    const load = () => targetService.getAllTargets().then(setAllTargets);
    load();
    window.addEventListener('fab5-targets-updated', load);
    return () => window.removeEventListener('fab5-targets-updated', load);
  }, []);

  return useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthKey = getMonthStartISO(now);

    const actual = events
      .filter((e) => e.date >= monthStart && e.date <= monthEnd)
      .reduce((sum, e) => sum + e.bandwidth, 0);

    const target = employees.reduce(
      (sum, emp) => sum + resolveMonthlyTarget(allTargets[emp.id], monthKey), 0
    );

    const hasTarget = target > 0;
    const achievementPct = hasTarget ? Math.round((actual / target) * 100) : null;

    return { actual, target, hasTarget, achievementPct };
  }, [events, employees, allTargets]);
};