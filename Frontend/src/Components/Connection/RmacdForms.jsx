import React, { useState } from "react";
import { FileDown, Upload, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { useConnection } from "../../Context/ConnectionContext";

const REQUEST_ACTIONS = ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING", "RATE_REVISION", "IP_ADDITION"];
const RMACD_TYPES = ["UPGRADE", "DOWNGRADE", "SHIFTING"];
const TYPE_LABELS = {
  UPGRADE: "Bandwidth Upgrade",
  DOWNGRADE: "Bandwidth Downgrade",
  SHIFTING: "Shifting",
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

// The RMACD form that belongs to the connection's current request, and whether it can still be signed/replaced
// (mirrors the backend: replaceable until that request is approved).
const getCurrentForm = (connection) => {
  const history = connection.history || [];
  const entryIndex = history.map((h) => REQUEST_ACTIONS.includes(h.action)).lastIndexOf(true);
  const entry = history[entryIndex];
  if (!entry || !RMACD_TYPES.includes(entry.action)) return null;

  const form = (connection.rmacdForms || []).find((f) => String(f.historyEntryId) === String(entry._id));
  if (!form) return null;

  const approvedSince = history.slice(entryIndex + 1).some((h) => ["APPROVED", "ACTIVATED"].includes(h.action));
  const open = ["Pending", "Rejected"].includes(connection.status) && !approvedSince;
  return open ? form : null;
};

const FileLink = ({ href, title, icon, tone }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" title={title}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${tone}`}>
    {icon} {title}
  </a>
);

// RMACD (Charge Deviation Form) for upgrade / downgrade / shifting requests: download the unsigned form,
// upload the customer-signed copy. Admins and the employee managing this customer get the full card;
// owners (approvers) get a read-only view with the signed forms only.
const RmacdForms = ({ connection, user, onUploaded }) => {
  const { uploadSignedRmacd } = useConnection();
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const isAdmin = user?.role === "admin";
  const isManagingEmployee = user?.role === "employee" &&
    String(connection?.customer?.managedBy || "") === String(user?._id || user?.id || "");
  const isOwner = user?.role === "owner";
  if (!isAdmin && !isManagingEmployee && !isOwner) return null;
  const canManage = isAdmin || isManagingEmployee;
  const forms = connection?.rmacdForms || [];
  if (forms.length === 0) return null;

  const current = getCurrentForm(connection);
  // Owners only see forms that have been signed.
  const previous = forms.filter((f) => f !== current && (canManage || f.signed?.url)).slice().reverse();
  if (!current && previous.length === 0) return null;

  const handleUpload = async () => {
    if (!file) return toast.error("Choose the signed RMACD form first");
    const formData = new FormData();
    formData.append("rmacd", file);
    setIsUploading(true);
    const result = await uploadSignedRmacd(connection._id, formData);
    setIsUploading(false);
    if (result) {
      setFile(null);
      onUploaded?.();
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mt-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Change Request Form (RMACD)</h2>

      {current && (
        <div className="flex flex-col gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-gray-800">
              {TYPE_LABELS[current.requestType]} <span className="font-normal text-gray-500">— requested {formatDate(current.createdAt)}</span>
            </span>
            {current.signed?.url ? (
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={12} /> Signed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <Clock size={12} /> Pending signature
              </span>
            )}
          </div>

          {!current.signed?.url && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {canManage
                ? "Download the RMACD form, get it signed by the customer and upload the signed copy. This request can't be approved until then."
                : "The signed RMACD form hasn't been uploaded yet. This request can be approved once it is."}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {canManage && current.unsigned?.url && (
              <FileLink href={current.unsigned.url} title="Unsigned RMACD" icon={<FileDown size={14} />} tone="text-indigo-600 bg-indigo-50 hover:bg-indigo-100" />
            )}
            {current.signed?.url && (
              <FileLink href={current.signed.url} title="Signed RMACD" icon={<ExternalLink size={14} />} tone="text-emerald-700 bg-emerald-50 hover:bg-emerald-100" />
            )}
          </div>

          {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`relative flex flex-1 min-w-[200px] items-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 text-xs cursor-pointer transition-all ${file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-300 hover:border-blue-400 text-gray-600"}`}>
              <Upload size={14} className="shrink-0" />
              <span className="truncate">{file ? file.name : `${current.signed?.url ? "Replace" : "Upload"} signed RMACD`}</span>
              <input type="file" accept=".pdf, image/*" onChange={(e) => setFile(e.target.files[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
            {file && (
              <button type="button" onClick={handleUpload} disabled={isUploading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-semibold shadow transition">
                <Upload size={16} /> {isUploading ? "Uploading..." : "Upload"}
              </button>
            )}
          </div>
          )}
        </div>
      )}

      {previous.length > 0 && (
        <div className={current ? "mt-4" : ""}>
          <h3 className="text-[10px] uppercase font-bold text-gray-400 mb-2">Previous Requests</h3>
          <ul className="flex flex-col gap-2">
            {previous.map((form) => (
              <li key={form._id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-800">
                  {TYPE_LABELS[form.requestType]} <span className="text-gray-500">— {formatDate(form.createdAt)}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {canManage && form.unsigned?.url && (
                    <FileLink href={form.unsigned.url} title="Unsigned" icon={<FileDown size={14} />} tone="text-indigo-600 bg-indigo-50 hover:bg-indigo-100" />
                  )}
                  {form.signed?.url ? (
                    <FileLink href={form.signed.url} title="Signed" icon={<ExternalLink size={14} />} tone="text-emerald-700 bg-emerald-50 hover:bg-emerald-100" />
                  ) : (
                    <span className="px-3 py-1.5 text-xs text-gray-500">Not signed</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RmacdForms;
