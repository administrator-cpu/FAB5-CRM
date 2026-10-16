import React, { useEffect, useState } from "react";
import { useConnection } from "../../Context/ConnectionContext";
import { useNavigate, useParams } from "react-router-dom";
import HistoryTimeline from "./HistoryTimeline";
import { useAuth } from "../../Context/AuthContext";
import QuickActions from "./QuickActions";
import SigningDocuments from "./SigningDocuments";
import RmacdForms from "./RmacdForms";
import NetworkTopology from "./NetworkTopology";
import TelcoCircuitIdRow from "./TelcoCircuitIdRow";
import { X, Trash2, AlertTriangle } from "lucide-react"; // Added Trash2 and AlertTriangle
import { InputUnit } from "../Utils/InputUnit";
import { Edit, Send } from "../Icons/Icons";

function OpportunityDetails() {
  const {
    getConnectionById,
    Generate,
    singleConnectionData,
    approveConnection,
    activeConnection,
    Reject,
    Cancel, // Destructured Cancel
    Delete,
    EditRemark,
    CostProvider,
  } = useConnection();

  const data = singleConnectionData;
  

  const [prevData, setPrevData] = useState(data);
  const [formData, setFormData] = useState({
    remark: data?.remarks || "No remarks available.",
  });

  if (data !== prevData) {
    setPrevData(data);
    setFormData({
      remark: data?.remarks || "No remarks available.",
    });
  }

  const [remarkStatus, setRemarkStatus] = useState(true);
  const { remark } = formData;

  const handleChange = (e) => {
    const { value, name } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const [reason, setReason] = useState("");
  const [reasonTab, setReasonTab] = useState(false);
  
  // --- DELETE MODAL STATES ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user } = useAuth();
  const { cid } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (cid) getConnectionById(cid);
  }, [cid, getConnectionById]);

  const handleApprove = async () => {
    await approveConnection(cid);
    await getConnectionById(cid);
  };

  const handleReject = () => {
    setReasonTab(true);
  };

  const conectionReject = async () => {
    await Reject(cid, { reason });
    await getConnectionById(cid);
    setReasonTab(false);
  };

  const handleGenerate = async () => {
    await Generate(cid);
    await getConnectionById(cid);
  };

  const handleSaveGenerationPrice = async (connectionId, price) => {
   await CostProvider(connectionId, {ratePerMb:price});
   await getConnectionById(cid);
  };

  const handleCancel = async () => {
    await Cancel(cid); 
    await getConnectionById(cid);
  };

  // --- ADMIN DELETE FUNCTION ---
  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await Delete(cid);
      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      setIsDeleting(false);
    }
  };

  const handleActivate = async (telecoCircuitId) => {
    await activeConnection(cid, telecoCircuitId);
    await getConnectionById(cid);
  };

  const handleRemarkEdit = async () => {
    setRemarkStatus(true);
    await EditRemark(cid, {remarks:remark})
  };

  if (!data)
    return (
      <div className="flex justify-center p-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );

  // --- SMART HISTORY CHECK ---
  const historyList = data?.history || [];
  const latestAction = [...historyList].reverse().find(h => h.action !== 'APPROVED' && h.action !== 'REJECTED')?.action;
  const isIpAddition = latestAction === 'IP_ADDITION';

  const formatCurrency = (val) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(val || 0);

  const formatDate = (dateString) =>
    dateString
      ? new Date(dateString).toLocaleString("en-IN", { dateStyle: "medium" })
      : "N/A";

  const getStatusColor = (status) => {
    switch (status) {
      case "Active": return "bg-green-100 text-green-800 border-green-200";
      case "Approved":
      case "Generation": return "bg-blue-100 text-blue-800 border-blue-200";
      case "Notice Period": return "bg-orange-100 text-orange-800 border-orange-200";
      case "Disconnected":
      case "Rejected": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-yellow-100 text-yellow-800 border-yellow-200";
    }
  };

  // Latest signed RMACD — a newer request's signed form replaces the previous one here.
  const latestSignedRmacd = (data.rmacdForms || [])
    .filter((form) => form.signed?.url)
    .sort((a, b) => new Date(b.signed.uploadedAt || b.createdAt) - new Date(a.signed.uploadedAt || a.createdAt))[0];

  const renderDocCard = (label, doc) => {
    if (!doc || !doc.url) return null;
    return (
      <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
        <div className="flex items-center gap-3 overflow-hidden">
          <span className="text-2xl" aria-hidden="true">📄</span>
          <div className="flex flex-col overflow-hidden">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</span>
            <span className="text-sm font-semibold text-gray-800 truncate" title={doc.fileName}>{doc.fileName}</span>
            {doc.uploadedAt && (
              <span className="text-[11px] text-gray-500">Uploaded {formatDate(doc.uploadedAt)}</span>
            )}
          </div>
        </div>
        <a href={`https://docs.google.com/viewer?url=${doc.url}`} target="_blank" rel="noopener noreferrer" className="ml-4 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors whitespace-nowrap">
          View PDF
        </a>
      </div>
    );
  };

  return (
    <div className="p-6 w-full mx-auto flex-col md:flex-row flex gap-6 font-sans relative">
      
      {/* REJECT MODAL */}
      {reasonTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <X size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Reject Connection?</h3>
            <p className="text-gray-500 text-sm mb-4">Please provide a reason for rejecting this connection request.</p>
            <div className="w-full mb-6 text-left">
              <InputUnit placeholder={"Enter rejection reason..."} type={"text"} value={reason} change={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReasonTab(false)} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition">Cancel</button>
              <button type="button" onClick={conectionReject} disabled={!reason.trim()} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden text-center p-6">
            <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Connection?</h3>
            <p className="text-slate-500 text-sm mb-6">
              Are you sure you want to permanently delete this record? This bypasses standard disconnection workflows and <span className="font-bold text-rose-500">cannot be undone</span>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                disabled={isDeleting} 
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition flex justify-center items-center gap-2"
              >
                {isDeleting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Column */}
      <div className="flex flex-col flex-1 gap-6 customScroller overflow-auto max-h-[80vh]">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Lifecycle Tracking</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Approved By:</span>
              <span>{data.approvedBy?.name || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Activated By:</span>
              <span>{data.activatedBy?.name || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Acceptance Date:</span>
              <span>{formatDate(data.acceptanceDate) || "-"}</span>
            </div>
            <div className="flex flex-col pt-2 border-t">
              <span className="text-gray-500 mb-1">Remark:</span>
              <div className="relative flex items-center justify-end">
                {remarkStatus ? (
                  <button 
                    type="button" 
                    aria-label="Edit remark"
                    className="absolute right-3 bg-transparent border-none p-0 flex items-center justify-center" 
                    onClick={() => setRemarkStatus(false)}
                  >
                    <Edit className="h-4 hover:opacity-50 transition-all duration-200 cursor-pointer" />
                  </button>
                ) : (
                  <button 
                    type="button" 
                    aria-label="Save remark"
                    className="absolute right-3 bg-transparent border-none p-0 flex items-center justify-center" 
                    onClick={() => handleRemarkEdit()}
                  >
                    <Send className="h-4 hover:opacity-50 transition-all duration-200 cursor-pointer" />
                  </button>
                )}
                <input type="text" value={remark} name="remark" disabled={remarkStatus} onChange={handleChange} className="w-full text-gray-700 italic bg-gray-50 p-2 rounded border-dashed border border-gray-200" />
              </div>
            </div>
            {(user?.role == "admin" || user?.role == "project_manager" || user?.role == "order_generation") && (
              <TelcoCircuitIdRow connection={data} isAdmin={user?.role === "admin"} onSaved={() => getConnectionById(cid)} />
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Customer Info</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Company:</span>
              <span className="font-semibold text-gray-900 truncate">{data.customer?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Contact:</span>
              <span>{data.customer?.person}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Email:</span>
              <a href={`mailto:${data.customer?.email}`} className="text-blue-600 hover:underline">{data.customer?.email}</a>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mobile:</span>
              <span>{data.customer?.mobile}</span>
            </div>
          </div>
        </div>

        {user?.role != "project_manager" && user?.role != "order_generation" && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Service & Billing</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Type & Bandwidth:</span>
                <span className="font-bold text-indigo-700">{data.serviceType} - {data.bandwidth} Mbps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">MRC:</span>
                <span className="font-semibold text-green-700">{formatCurrency(data.commercials?.mrc)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Advance Paid:</span>
                <span>{formatCurrency(data.commercials?.advance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">OTC:</span>
                <span>{formatCurrency(data.commercials?.otc)}</span>
              </div>
              {data.ips?.count > 0 && (
                <>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-gray-500">Number of IPs:</span>
                    <span>{data.ips.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Per IP Cost:</span>
                    {/* Older connections have no per-IP rate stored: total ÷ count. */}
                    <span>{formatCurrency(data.ips.perIpCost || (data.ips.cost || 0) / data.ips.count)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total IP Cost:</span>
                    <span>{formatCurrency(data.ips.cost)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Column */}
      <div className="flex-[3] customScroller min-w-[60vw] overflow-auto max-h-[80vh]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center my-6 gap-4 border-b pb-4">
          <div>
            {user?.role === "admin"  && (
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                className="flex items-center gap-2 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 px-1 py-1 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 border border-rose-100"
              >
                <Trash2 size={16} /> 
              </button>
            )}
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              {data.fabCircuitId || data.opportunityId}
              <span className={`px-3 py-1 rounded-full text-xs font-bold border shadow-sm uppercase tracking-wide ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Created on {formatDate(data.createdAt)} by <span className="font-medium text-gray-700">{data.createdBy?.name || "Unknown"}</span>
            </p>
          </div>

          <div className="flex gap-3 items-center">
            

            <QuickActions
              status={data.status}
              userRole={user?.role}
              connection={data}
              onApprove={handleApprove}
              onReject={handleReject}
              onGenerate={handleGenerate}
              onSavePrice={handleSaveGenerationPrice}
              onActivate={handleActivate}
              onCancel={handleCancel}
              onDelete={() => setIsDeleteModalOpen(true)} // Routes QuickAction deletes to the Modal
            />
          </div>
        </div>

        {data.status === "Rejected" && data.rejectionDetails && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r shadow-sm">
            <h3 className="text-red-800 font-bold text-sm">Connection Rejected</h3>
            <p className="text-red-700 text-sm mt-1">Reason: {data.rejectionDetails.reason}</p>
            <p className="text-red-500 text-xs mt-1">By: {data.rejectionDetails.rejectedBy?.name} on {formatDate(data.rejectionDetails.rejectedAt)}</p>
          </div>
        )}

        {(data.status === "Notice Period" || data.status === "Disconnected") && data.terminationDetails && (
          <div className="mb-6 bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r shadow-sm">
            <h3 className="text-orange-800 font-bold text-sm">Termination Notice</h3>
            <div className="flex gap-6 mt-1 text-sm text-orange-700">
              <p>Raised: <span className="font-semibold">{formatDate(data.terminationDetails.raiseDate)}</span></p>
              <p>Final Disconnect: <span className="font-semibold">{formatDate(data.terminationDetails.finalDate)}</span></p>
            </div>
            <p className="text-orange-600 text-sm mt-1">Reason: {data.terminationDetails.reason}</p>
          </div>
        )}

        {/* NETWORK TOPOLOGY */}
        <NetworkTopology connection={data} isAdmin={user?.role === "admin"} onSaved={() => getConnectionById(cid)} />

        <SigningDocuments connection={data} user={user} onUploaded={() => getConnectionById(cid)} />

        <RmacdForms connection={data} user={user} onUploaded={() => getConnectionById(cid)} />

        {/* CONNECTION DOCUMENTS */}
        {/* Admins and the employee managing this customer only; owners check signed documents in the Signing / RMACD cards. */}
        {(user?.role === "admin" ||
          (user?.role === "employee" && String(data.customer?.managedBy || "") === String(user?._id || user?.id || ""))) &&
          (data.purchaseOrders?.length > 0 || data.caf || data.businessAgreement || latestSignedRmacd) && (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mt-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">
                Connection Documents
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {data?.purchaseOrders?.map((po, index) => (
                  <React.Fragment key={po._id || index}>
                    {renderDocCard(`PO (${po.requestType || 'DOCUMENT'})`, po)}
                  </React.Fragment>
                ))}
                {renderDocCard("CAF Document", data.caf)}
                {renderDocCard("Business Agreement", data.businessAgreement)}
                {latestSignedRmacd && renderDocCard(`RMACD (${latestSignedRmacd.requestType})`, latestSignedRmacd.signed)}
              </div>
            </div>
          )}

        <div className="mt-6">
          <HistoryTimeline history={data.history} />
        </div>
      </div>
    </div>
  );
}

export default OpportunityDetails;