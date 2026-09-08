import { useEffect, useMemo, useState } from 'react';
import targetService from '../../Services/targetService';

// Current month's Actual (bandwidth sold) vs Target (sum of employees' weekly
// targets for weeks whose Monday falls in this month). Shared by the KPI
// strip and the Alerts & Risk Center so both agree on the same number.
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

    const actual = events
      .filter((e) => e.date >= monthStart && e.date <= monthEnd)
      .reduce((sum, e) => sum + e.bandwidth, 0);

    let target = 0;
    employees.forEach((emp) => {
      const map = allTargets[emp.id] || {};
      Object.entries(map).forEach(([weekStartISO, mbps]) => {
        const monday = new Date(weekStartISO);
        if (monday >= monthStart && monday <= monthEnd) target += Number(mbps) || 0;
      });
    });

    const hasTarget = target > 0;
    const achievementPct = hasTarget ? Math.round((actual / target) * 100) : null;

    return { actual, target, hasTarget, achievementPct };
  }, [events, employees, allTargets]);
};
