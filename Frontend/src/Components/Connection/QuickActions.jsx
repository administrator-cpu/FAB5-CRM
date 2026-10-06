import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CancelOrder from './CancelOrder';

const QuickActions = ({ 
  status, 
  userRole,
  connection, 
  onApprove, 
  onReject, 
  onGenerate, 
  onSavePrice, 
  onActivate, 
  onCancel,
  onDelete 
}) => {
  const [circuitId, setCircuitId] = useState({ 
    telecoCircuitId: "", 
    acceptanceDate: new Date().toISOString().split('T')[0] 
  });
  
  const [genPrice, setGenPrice] = useState("");
  const { id, cid } = useParams();

  const handleCircuitChange = (e) => {
    const { name, value } = e.target;
    setCircuitId({ ...circuitId, [name]: value });
  };

  const handlePriceChange = (e) => {
    setGenPrice(e.target.value);
  };

  const handlePriceSubmit = () => {
    if (genPrice && onSavePrice) {
      onSavePrice(cid, genPrice);
    }
  };

  // --- SMART HISTORY CHECK ---
  // Find the most recent action that triggered this approval workflow
  const historyList = connection?.history || [];
  const latestAction = [...historyList].reverse().find(h => h.action !== 'APPROVED' && h.action !== 'REJECTED')?.action;
  const isIpAddition = latestAction === 'IP_ADDITION';

  // A new order can't be approved until the signed CAF and signed PO are uploaded (enforced by the backend too).
  const requestType = [...historyList].reverse()
    .find(h => ['CREATED', 'UPGRADE', 'DOWNGRADE', 'SHIFTING', 'RATE_REVISION', 'IP_ADDITION'].includes(h.action))?.action;
  const hasSignedDocuments = Boolean(connection?.caf?.url) &&
    (connection?.purchaseOrders || []).some(po => po.requestType === 'CREATED' && po.url);
  const awaitingSignedDocuments = requestType === 'CREATED' && !hasSignedDocuments;

  // 1. OWNER ACTIONS
  if (status === 'Pending' && (userRole === 'owner' || userRole === 'admin')) {
    return (
      <div className="flex gap-2">
        <button onClick={onReject} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-2 rounded text-sm font-semibold transition">
          Reject
        </button>
        <button
          onClick={onApprove}
          disabled={awaitingSignedDocuments}
          title={awaitingSignedDocuments ? "Signed CAF and signed PO must be uploaded first" : undefined}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-semibold shadow transition"
        >
          {awaitingSignedDocuments ? "Awaiting Signed Docs" : "Approve Request"}
        </button>
      </div>
    );
  }

  // 2. ORDER GENERATION ACTIONS
  if (status === 'Approved' && (userRole === 'order_generation' || userRole === 'admin')) {
    
    // Phase 1: Not an IP addition AND no generation price exists yet
    if (!isIpAddition && !connection?.providerCost?.ratePerMb) {
      return (
        <div className="flex items-center gap-2 bg-white p-1.5 border rounded-md shadow-sm">
          <div className="flex flex-col px-2">
            <label className="text-[10px] uppercase text-gray-500 font-bold">Generation Price (₹)</label>
            <input 
              type="number" 
              placeholder="Enter price..." 
              className="px-1 py-1 text-sm outline-none w-32 bg-transparent"
              value={genPrice}
              onChange={handlePriceChange}
              required
            />
          </div>
          <button 
            onClick={handlePriceSubmit} 
            disabled={!genPrice}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-4 py-2 rounded text-sm font-semibold shadow-sm transition"
          >
            Save Price
          </button>
        </div>
      );
    }
    
    // Phase 2: It IS an IP addition OR Price exists -> Ready to generate
    return (
      <div className="flex items-center gap-4">
        {!isIpAddition ? (
          <div className="text-sm flex gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
            <span className="text-gray-500 mr-1">RPM:</span>
            <span className="font-bold text-gray-800">₹{connection?.providerCost?.ratePerMb}</span>
            <span className="text-gray-500 ml-2 mr-1">MRC:</span>
            <span className="font-bold text-gray-800">₹{connection?.providerCost?.mrc}</span>
          </div>
        ) : (
          <div className="text-sm flex gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm">
            <span className="font-bold text-indigo-600">IP Addition Request</span>
            <span className="text-indigo-400">- No Gen Price required</span>
          </div>
        )}
        
        {/* <button onClick={onGenerate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold shadow transition">
          Generate Order
        </button> */}
      </div>
    );
  }

  // 3. PROJECT MANAGER ACTIONS
  if (status === 'Generation' && (userRole === 'project_manager' || userRole === 'admin')) {
    return (
      <div className="flex flex-col md:flex-row items-center gap-2 bg-white p-2 border rounded-md shadow-sm">
        <button type="button" className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-4 py-2 rounded text-sm font-semibold transition">
          <CancelOrder/>
        </button>
        <div className="flex flex-col">
          <label className="text-[10px] uppercase text-gray-500 font-bold px-1">Circuit ID</label>
          <input 
            type="text" 
            placeholder="Enter ID..." 
            name="telecoCircuitId"
            className="px-3 py-1.5 text-sm outline-none w-40 bg-transparent border-b md:border-none"
            value={circuitId.telecoCircuitId}
            onChange={handleCircuitChange}
            required
          />
        </div>

        <div className="flex flex-col border-l pl-2">
          <label className="text-[10px] uppercase text-gray-500 font-bold px-1">Acceptance Date</label>
          <input 
            type="date" 
            name="acceptanceDate"
            className="px-3 py-1.5 text-sm outline-none bg-transparent"
            value={circuitId.acceptanceDate}
            onChange={handleCircuitChange}
            required
          />
        </div>

        <button 
          type="button"
          onClick={() => onActivate(circuitId)}
          disabled={!circuitId.telecoCircuitId?.trim() || !circuitId.acceptanceDate}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-2 rounded text-sm font-semibold transition ml-auto"
        >
          Activate
        </button>
      </div>
    );
  }

  // 4. EMPLOYEE ACTIONS
  if (userRole === 'employee' || userRole === 'admin') {
    if (status === 'Cancelled' || status === 'Canceled') return null;
    
    if (status === "Rejected" || status === "Pending") {
      return (
        <div className="flex gap-2">
          {(status === "Pending" && connection?.history?.length === 1) && (
            <button type="button" onClick={onDelete} className="bg-red-400 border hover:bg-red-50 text-white hover:text-black px-4 py-2 rounded text-sm font-semibold shadow-sm transition">
              Delete
            </button>
          )}
          <Link to={`/customer/${id}/connection/${cid}/edit`} className="bg-white border hover:bg-gray-50 text-gray-700 px-4 py-2 rounded text-sm font-semibold shadow-sm transition">
            Edit
          </Link>
        </div>
      );
    } else if(status !== "Rejected" && status !== "Pending") {
      return (
        <Link to={`/customer/${id}/connection/${cid}/manage`} className="bg-white border hover:bg-gray-50 text-gray-700 px-4 py-2 rounded text-sm font-semibold shadow-sm transition">
          MACD
        </Link>
      );
    }
  }

  return null;
};

export default QuickActions;

