import React, { useState } from "react";
import { FileDown, Upload, CheckCircle2, Clock, Lock, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { useConnection } from "../../Context/ConnectionContext";

const formatDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

const DocumentLinks = ({ title, unsigned, signed }) => (
  <div className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-bold text-gray-800">{title}</span>
      {signed?.url ? (
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={12} /> Signed
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          <Clock size={12} /> Pending signature
        </span>
      )}
    </div>
    <div className="flex flex-wrap gap-2">
      {unsigned?.url && (
        <a href={unsigned.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors">
          <FileDown size={14} /> Unsigned {title}
        </a>
      )}
      {signed?.url && (
        <a href={signed.url} target="_blank" rel="noopener noreferrer" title={signed.fileName} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors">
          <ExternalLink size={14} /> Signed {title}
        </a>
      )}
    </div>
  </div>
);

const FilePicker = ({ label, file, onChange, name }) => (
  <label className={`relative flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 text-xs cursor-pointer transition-all ${file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-300 hover:border-blue-400 text-gray-600"}`}>
    <Upload size={14} className="shrink-0" />
    <span className="truncate">{file ? file.name : label}</span>
    <input type="file" name={name} accept=".pdf, image/*" onChange={onChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
  </label>
);

const BatchCard = ({ batch, canManage, onUpdated }) => {
  const { uploadBulkSignedDocuments } = useConnection();
  const [files, setFiles] = useState({ caf: null, purchaseOrder: null });
  const [isUploading, setIsUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const total = batch.connections.length;
  const signedCount = batch.connections.filter((c) => c.signedDocumentsComplete).length;
  const openCount = batch.connections.filter((c) => !c.locked).length;
  const canUpload = canManage && openCount > 0;

  const handleFileChange = (e) => {
    const { name, files: selected } = e.target;
    setFiles((prev) => ({ ...prev, [name]: selected[0] || null }));
  };

  const handleUpload = async () => {
    if (!files.caf && !files.purchaseOrder) return toast.error("Choose the signed CAF and/or PO first");
    const formData = new FormData();
    if (files.caf) formData.append("caf", files.caf);
    if (files.purchaseOrder) formData.append("purchaseOrder", files.purchaseOrder);

    setIsUploading(true);
    const result = await uploadBulkSignedDocuments(batch._id, formData);
    setIsUploading(false);
    if (result) {
      setFiles({ caf: null, purchaseOrder: null });
      onUpdated?.(result.batch);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-gray-800">{batch.batchNumber}</p>
          <p className="text-xs text-gray-500">
            {total} connection{total === 1 ? "" : "s"} · created {formatDate(batch.createdAt)}
            {batch.createdBy?.name ? ` by ${batch.createdBy.name}` : ""}
          </p>
          {batch.removedCount > 0 && (
            <p className="text-xs text-gray-500">
              {batch.removedCount} deleted / cancelled connection{batch.removedCount === 1 ? "" : "s"} not shown (still listed on this batch's PO & CAF)
            </p>
          )}
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${signedCount === total ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
          Signed CAF & PO on {signedCount} / {total}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DocumentLinks title="CAF" unsigned={batch.generatedDocuments?.caf} signed={batch.signedDocuments?.caf} />
        <DocumentLinks title="PO" unsigned={batch.generatedDocuments?.po} signed={batch.signedDocuments?.po} />
      </div>

      {canUpload ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-gray-600">
            Upload the customer-signed copies once — they are added to all {openCount} connection{openCount === 1 ? "" : "s"} of this batch that haven't been approved yet.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FilePicker name="caf" file={files.caf} onChange={handleFileChange} label={`${batch.signedDocuments?.caf ? "Replace" : "Upload"} signed CAF`} />
            <FilePicker name="purchaseOrder" file={files.purchaseOrder} onChange={handleFileChange} label={`${batch.signedDocuments?.po ? "Replace" : "Upload"} signed PO`} />
          </div>
          {(files.caf || files.purchaseOrder) && (
            <div className="flex justify-end">
              <button type="button" onClick={handleUpload} disabled={isUploading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-semibold shadow transition">
                <Upload size={16} /> {isUploading ? "Uploading..." : `Upload to ${openCount} connection${openCount === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </div>
      ) : openCount === 0 && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <Lock size={12} /> All connections in this batch are approved — signed documents are locked.
        </p>
      )}

      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 self-start">
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {expanded ? "Hide" : "Show"} connections
      </button>
      {expanded && (
        <div className="max-h-64 overflow-y-auto border rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="p-2 border-b">Opportunity ID</th>
                <th className="p-2 border-b">Service</th>
                <th className="p-2 border-b">Bandwidth</th>
                <th className="p-2 border-b">Status</th>
                <th className="p-2 border-b">Signed CAF & PO</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {batch.connections.map((c) => (
                <tr key={c._id}>
                  <td className="p-2 font-mono">{c.opportunityId}</td>
                  <td className="p-2">{c.serviceType}</td>
                  <td className="p-2">{c.bandwidth} Mbps</td>
                  <td className="p-2">{c.status}</td>
                  <td className="p-2">{c.signedDocumentsComplete ? "✅ Yes" : "⏳ Pending"}{c.locked ? " · locked" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Bulk uploads of this customer: each has one unsigned PO / CAF covering all its connections,
// and the signed copies are uploaded here once for the whole batch.
const BulkBatches = ({ batches, canManage, onUpdated }) => {
  if (!batches?.length) return null;
  return (
    <section className="p-5 border border-gray-200 rounded-lg flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Bulk Orders — Signing Documents</h2>
        <p className="text-sm text-gray-500">Download the PO and CAF for a batch, get them signed by the customer, then upload the signed copies once for all its connections.</p>
      </div>
      {batches.map((batch) => (
        <BatchCard key={batch._id} batch={batch} canManage={canManage} onUpdated={onUpdated} />
      ))}
    </section>
  );
};

export default BulkBatches;
