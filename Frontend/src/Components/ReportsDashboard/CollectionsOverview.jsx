import React, { useEffect, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import CollectionVsOutstandingChart from './Charts/CollectionVsOutstandingChart';
import AgingAnalysisChart from './Charts/AgingAnalysisChart';
import CollectionEfficiencyGauge from './Charts/CollectionEfficiencyGauge';
import TopDefaultersChart from './Charts/TopDefaultersChart';
import WeeklyCollectionsChart from './Charts/WeeklyCollectionsChart';
import api from './api';
import { useDashboardAnalytics } from './useDashboardAnalytics';

const CollectionsOverview = () => {
  let { fetchOverview, overview, setOverview,
    loading, setLoading,
    error, setError, cancelled } = useDashboardAnalytics({ allData: null, pmData: null, isProjectManager: false, timeRange: 'last_30_days', collectionsData: null });

  useEffect(() => {


    fetchOverview();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center text-slate-400">
        {error || 'No data available.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-indigo-600 flex items-center gap-2 tracking-wide">
        <LayoutDashboard size={20} />
        COLLECTIONS OVERVIEW
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CollectionVsOutstandingChart data={overview.collectionVsOutstanding} />
        </div>
        <div className="lg:col-span-1">
          <AgingAnalysisChart data={overview.agingAnalysis} />
        </div>
        <div className="lg:col-span-1 flex flex-col gap-6">
          <CollectionEfficiencyGauge value={overview.collectionEfficiency} target={90} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <TopDefaultersChart data={overview.topDefaulters} />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <WeeklyCollectionsChart data={overview.weeklyCollections} />
      </div>
    </div>
  );
};

export default CollectionsOverview;