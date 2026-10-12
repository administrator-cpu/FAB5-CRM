import React, { useState } from "react";
import { FileDown, Upload, CheckCircle2, Clock, Lock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { useConnection } from "../../Context/ConnectionContext";

// Signed copies can be replaced until the order is first approved (mirrors the backend rule).
const isLocked = (connection) =>
  !["Pending", "Rejected"].includes(connection.status) ||
  (connection.history || []).some((entry) => ["APPROVED", "ACTIVATED"].includes(entry.action));

const DocumentRow = ({ title, unsigned, signed, file, onFileChange, canUpload, inputName }) => (
  <div className="flex flex-col gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-bold text-gray-800">{title}</span>
      {signed ? (
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

    {canUpload && (
      <label className={`relative flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 text-xs cursor-pointer transition-all ${file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-300 hover:border-blue-400 text-gray-600"}`}>
        <Upload size={14} className="shrink-0" />
        <span className="truncate">{file ? file.name : `${signed ? "Replace" : "Upload"} signed ${title}`}</span>
        <input type="file" name={inputName} accept=".pdf, image/*" onChange={onFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
    )}
  </div>
);

// Visible to admins and to the employee managing this customer only.
const SigningDocuments = ({ connection, user, onUploaded }) => {
  const { uploadSignedDocuments } = useConnection();
  const [files, setFiles] = useState({ caf: null, purchaseOrder: null });
  const [isUploading, setIsUploading] = useState(false);

  // Signing documents (unsigned and signed) are only for employees and admins.
  const isAdmin = user?.role === "admin";
  const isManagingEmployee = user?.role === "employee" &&
    String(connection?.customer?.managedBy || "") === String(user?._id || user?.id || "");
  if (!isAdmin && !isManagingEmployee) return null;

  const generated = connection?.generatedDocuments;
  // Only connections created with the generate-then-sign flow have unsigned documents.
  if (!generated?.caf?.url && !generated?.po?.url) return null;

  const signedCaf = connection.caf?.url ? connection.caf : null;
  const signedPo = (connection.purchaseOrders || []).find((po) => po.requestType === "CREATED" && po.url) || null;
  const locked = isLocked(connection);
  const canUpload = !locked;
  const pending = !signedCaf || !signedPo;

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
    const result = await uploadSignedDocuments(connection._id, formData);
    setIsUploading(false);
    if (result) {
      setFiles({ caf: null, purchaseOrder: null });
      onUploaded?.();
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mt-6">
      <div className="flex items-center justify-between border-b pb-2 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Signing Documents</h2>
        {locked && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
            <Lock size={12} /> Locked after approval
          </span>
        )}
      </div>

      {pending && !locked && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Download the unsigned CAF and PO, get them signed by the customer, then upload the signed copies here.
          The order can't be approved until both signed documents are uploaded.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DocumentRow title="CAF" inputName="caf" unsigned={generated.caf} signed={signedCaf}
          file={files.caf} onFileChange={handleFileChange} canUpload={canUpload} />
        <DocumentRow title="PO" inputName="purchaseOrder" unsigned={generated.po} signed={signedPo}
          file={files.purchaseOrder} onFileChange={handleFileChange} canUpload={canUpload} />
      </div>

      {canUpload && (files.caf || files.purchaseOrder) && (
        <div className="flex justify-end mt-4">
          <button type="button" onClick={handleUpload} disabled={isUploading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-semibold shadow transition">
            <Upload size={16} /> {isUploading ? "Uploading..." : "Upload signed documents"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SigningDocuments;
