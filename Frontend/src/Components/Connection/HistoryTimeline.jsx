import React from 'react';
import { useAuth } from '../../Context/AuthContext';

// FIX APPLIED HERE: Moved heavy Intl engine outside the component
const currencyFormatter = new Intl.NumberFormat('en-IN', { 
  style: 'currency', 
  currency: 'INR' 
});

// FIX APPLIED HERE: Moved pure formatting functions completely outside
const formatCurrency = (val) => currencyFormatter.format(val || 0);

const formatDate = (dateString) => new Date(dateString).toLocaleString('en-IN', { 
  dateStyle: 'medium', 
  timeStyle: 'short' 
});

const formatJustDate = (dateString) => new Date(dateString).toLocaleDateString('en-IN', { 
  dateStyle: 'medium' 
});

// FIX APPLIED HERE: Moved pure switch statement outside so it isn't rebuilt
const getActionTheme = (action) => {
  switch (action) {
    case 'CREATED':
    case 'GENERATION':
    case 'SIGNED_DOCUMENT_UPLOADED':
      return { color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' };
    case 'APPROVED':
    case 'ACTIVATED':
    case 'RETAINED':
      return { color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' };
    case 'UPGRADE':
    case 'IP_ADDITION':
      return { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    case 'DOWNGRADE':
    case 'SHIFTING':
    case 'EXTENDED':
      return { color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' };
    case 'REJECTED':
    case 'DISCONNECT_INITIATED':
    case 'TERMINATED':
      return { color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' };
    default:
      return { color: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-500' };
  }
};

const HistoryTimeline = ({ history }) => {
  const { user } = useAuth();
  
  if (!history || history.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Activity History</h2>
        <p className="text-gray-500 text-sm">No history recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mt-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-6 border-b pb-2">
        Activity History ({history.length})
      </h2>
      
      <div className="relative border-l-2 border-gray-200 ml-3 space-y-8 pb-4">
        {history.slice().reverse().map((record, index) => {
          // reverse() ensures newest is at the top (optional, but standard for timelines)
          const theme = getActionTheme(record.action);
          
          return (
            <div key={record._id || index} className="relative pl-6">
              
              {/* Timeline Dot */}
              <span className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full ${theme.dot} border-4 border-white shadow-sm`}></span>
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                <div>
                  <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase rounded border ${theme.color} mb-1`}>
                    {record.action}
                  </span>
                  <p className="text-sm text-gray-700 mt-1">
                    by <span className="font-semibold text-gray-900">{record.performedBy?.name || 'System'}</span>
                  </p>
                </div>
                {/* FIX: Changed text-gray-500 to text-gray-600 to fix contrast warning on gray background */}
                <div className="text-xs text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded border">
                  {formatDate(record.date)}
                </div>
              </div>

              {/* Employee Note (If exists) */}
              {record.note && (
                <div className="mb-3 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-gray-700 rounded-r text-italic">
                  <span className="font-semibold mr-2">Note:</span>"{record.note}"
                </div>
              )}

              {/* Snapshot Data Grid (Only shows if there is data) */}
              {(record.bandwidth || record.commercials?.mrc > 0) && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 mb-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Service</p>
                      <p className="font-medium text-gray-900">{record.serviceType}</p>
                      <p className="text-xs text-gray-500">{record.technicalDetails?.telcoProvider}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Bandwidth & IPs</p>
                      <p className="font-medium text-indigo-700">{record.bandwidth} Mbps</p>
                      {record.ips?.count > 0 && <p className="text-xs text-gray-500">{record.ips.count} IPs</p>}
                    </div>
                    {(user?.role!="project_manager" && user?.role!="order_generation")&&<div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Commercials</p>
                      <p className="font-medium text-green-700">{formatCurrency(record.commercials?.mrc)} MRC</p>
                      {record.commercials?.otc > 0 && <p className="text-xs text-gray-500">OTC: {formatCurrency(record.commercials.otc)}</p>}
                    </div>}
                    
                  </div>
                </div>
              )}

              {/* Termination Details (Only shows on Disconnect actions) */}
              {record.terminationDetails?.raiseDate && (
                 <div className="bg-red-50 rounded-lg p-3 border border-red-100 text-sm">
                   <p className="font-semibold text-red-800 mb-1">Termination Details</p>
                   <div className="flex gap-4 text-red-600 text-xs">
                     <p>Raised: {formatJustDate(record.terminationDetails.raiseDate)}</p>
                     <p>Final Date: {formatJustDate(record.terminationDetails.finalDate)}</p>
                   </div>
                   {record.terminationDetails.reason && (
                     <p className="text-red-700 text-xs mt-1 font-medium">Reason: {record.terminationDetails.reason}</p>
                   )}
                 </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryTimeline;