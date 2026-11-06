import React, { useState } from "react";
import { FileDown, Upload, CheckCircle2, Clock, Lock, ExternalLink, Send, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { useConnection } from "../../Context/ConnectionContext";

// Signed copies can be replaced until the order is first approved (mirrors the backend rule).
const isLocked = (connection) =>
  !["Pending", "Rejected"].includes(connection.status) ||
  (connection.history || []).some((entry) => ["APPROVED", "ACTIVATED"].includes(entry.action));

const formatDate = (value) =>
  new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

// Mirrors the backend limit: that many eSign stamps fit side by side on a signature line.
const MAX_SIGNERS = 3;

const ESIGN_TONE = {
  PENDING: "text-sky-800 bg-sky-50 border-sky-200",
  COMPLETED: "text-emerald-800 bg-emerald-50 border-emerald-200",
  DECLINED: "text-red-800 bg-red-50 border-red-200",
  EXPIRED: "text-red-800 bg-red-50 border-red-200",
  CANCELLED: "text-red-800 bg-red-50 border-red-200",
};

// Signers of an eSign request in signing order (requests sent before multi-signer support had one signer).
const esignSigners = (esign) =>
  esign.signers?.length
    ? [...esign.signers].sort((a, b) => a.order - b.order)
    : [{ order: 1, name: esign.signerName, email: esign.signerEmail }];

const DocumentRow = ({ title, unsigned, signed, esign, file, onFileChange, canUpload, inputName }) => (
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

    {esign && (!signed || esign.status === "COMPLETED") && (
      <div className={`flex items-start gap-1.5 text-[11px] rounded px-2 py-1.5 border ${ESIGN_TONE[esign.status] || ESIGN_TONE.PENDING}`}>
        <Send size={12} className="shrink-0 mt-0.5" />
        <div>
          <p>
            {esign.status === "COMPLETED" ? (
              <>Signed by everyone via eSign on {formatDate(esign.completedAt || esign.signedDocument?.receivedAt)}</>
            ) : ["DECLINED", "EXPIRED", "CANCELLED"].includes(esign.status) ? (
              <>eSign {esign.status.toLowerCase()}: sent on {formatDate(esign.sentAt)}. Send it again below.</>
            ) : (
              <>
                Sent for eSign on {formatDate(esign.sentAt)}
                {esign.expiresAt && <> · link expires {formatDate(esign.expiresAt)}</>}
              </>
            )}
          </p>
          <ol className="mt-1 space-y-0.5">
            {esignSigners(esign).map((s) => (
              <li key={`${s.order}-${s.email}`}>
                {s.order}. <span className="font-semibold">{s.name}</span> ({s.email})
              </li>
            ))}
          </ol>
        </div>
      </div>
    )}

    {canUpload && (
      <label className={`relative flex items-center gap-2 border-2 border-dashed rounded-lg px-3 py-2 text-xs cursor-pointer transition-all ${file ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-gray-300 hover:border-blue-400 text-gray-600"}`}>
        <Upload size={14} className="shrink-0" />
        <span className="truncate">{file ? file.name : `${signed ? "Replace" : "Upload"} signed ${title}`}</span>
        <input type="file" name={inputName} accept=".pdf, image/*" onChange={onFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
    )}
  </div>
);

// Admins and the employee managing this customer get the full card (unsigned downloads + uploads).
// Owners (approvers) get a read-only view of the signed CAF / PO so they can check them before approving.
const SigningDocuments = ({ connection, user, onUploaded }) => {
  const { uploadSignedDocuments, sendForEsign } = useConnection();
  const [files, setFiles] = useState({ caf: null, purchaseOrder: null });
  const [isUploading, setIsUploading] = useState(false);
  // Signing order: e-Hastakshar emails each signer only after the one above has signed.
  const [signers, setSigners] = useState([{
    name: connection?.customer?.person || "",
    email: connection?.customer?.email || "",
  }]);
  const [isSending, setIsSending] = useState(false);

  const isAdmin = user?.role === "admin";
  const isManagingEmployee = user?.role === "employee" &&
    String(connection?.customer?.managedBy || "") === String(user?._id || user?.id || "");
  const isOwner = user?.role === "owner";
  if (!isAdmin && !isManagingEmployee && !isOwner) return null;
  const canManage = isAdmin || isManagingEmployee;

  const generated = connection?.generatedDocuments;
  const hasGenerated = Boolean(generated?.caf?.url || generated?.po?.url);
  const signedCaf = connection.caf?.url ? connection.caf : null;
  const signedPo = (connection.purchaseOrders || []).find((po) => po.requestType === "CREATED" && po.url) || null;

  // Managers see this card for generate-then-sign connections (older ones use Connection Documents).
  // Owners don't see Connection Documents, so they get the signed CAF / PO here for any connection.
  if (canManage ? !hasGenerated : !hasGenerated && !signedCaf && !signedPo) return null;

  const locked = isLocked(connection);
  const canUpload = canManage && !locked;
  const pending = !signedCaf || !signedPo;

  // Latest eSign request per document (newest is last in the array).
  const latestEsign = (docType) =>
    [...(connection.esignRequests || [])].reverse().find((request) => request.docType === docType) || null;
  const esignCaf = latestEsign("CAF");
  const esignPo = latestEsign("PO");
  // eSign covers new single orders only for now (not bulk batches or modifications).
  const isNewOrder = !(connection.history || []).some((entry) =>
    ["UPGRADE", "DOWNGRADE", "SHIFTING", "RATE_REVISION", "IP_ADDITION"].includes(entry.action));
  const canEsign = canUpload && pending && !connection.bulkBatch && isNewOrder;
  const unsentDocs = [!signedCaf && !esignCaf && "CAF", !signedPo && !esignPo && "PO"].filter(Boolean);

  const updateSigner = (index, field, value) =>
    setSigners((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  const addSigner = () => setSigners((prev) => [...prev, { name: "", email: "" }]);
  const removeSigner = (index) => setSigners((prev) => prev.filter((_, i) => i !== index));
  const moveSigner = (index, offset) =>
    setSigners((prev) => {
      const next = [...prev];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });

  const handleSendEsign = async () => {
    const missing = signers.findIndex((s) => !s.name.trim() || !s.email.trim());
    if (missing >= 0) return toast.error(`Enter signer ${missing + 1}'s name and email`);
    const emails = signers.map((s) => s.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) return toast.error("Each signer needs a different email");
    setIsSending(true);
    const result = await sendForEsign(connection._id, {
      signers: signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })),
      // First send covers what hasn't gone out yet; "Send again" resends every unsigned document.
      ...(unsentDocs.length > 0 && { documents: unsentDocs }),
    });
    setIsSending(false);
    if (result) onUploaded?.();
  };

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

      {connection.bulkBatch && canManage && !locked && (
        <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-4">
          This connection was created in a bulk upload — its CAF and PO cover every connection of that batch.
          Upload the signed copies once from{" "}
          <Link to={`/customer/${connection.customer?._id || connection.customer}/bulk`} className="font-semibold underline">Import Connections</Link>
          {" "}to add them to all of them, or upload here to replace them for this connection only.
        </p>
      )}

      {pending && !locked && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          {canManage
            ? "Send the CAF and PO for eSign below (or download and get them signed by hand), then upload the signed copies here. The order can't be approved until both signed documents are uploaded."
            : "The signed CAF and PO haven't both been uploaded yet. The order can be approved once they are."}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DocumentRow title="CAF" inputName="caf" unsigned={canManage ? generated?.caf : null} signed={signedCaf}
          esign={canManage ? esignCaf : null} file={files.caf} onFileChange={handleFileChange} canUpload={canUpload} />
        <DocumentRow title="PO" inputName="purchaseOrder" unsigned={canManage ? generated?.po : null} signed={signedPo}
          esign={canManage ? esignPo : null} file={files.purchaseOrder} onFileChange={handleFileChange} canUpload={canUpload} />
      </div>

      {canEsign && (
        <div className="mt-4 p-4 border border-sky-200 bg-sky-50/50 rounded-lg">
          <p className="text-xs font-bold text-gray-700 mb-1">eSign with e-Hastakshar</p>
          <p className="text-[11px] text-gray-500 mb-3">
            Signers sign in this order: signer 1 gets the signing link and OTP by email first, and each next
            signer is emailed only after the one before has signed. Once everyone has signed, upload the signed copies above.
          </p>
          <div className="flex flex-col gap-2">
            {signers.map((s, index) => (
              <div key={index} className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-sky-600 text-white text-[11px] font-bold">
                  {index + 1}
                </span>
                <input type="text" value={s.name} maxLength={100} placeholder="Signer name"
                  onChange={(e) => updateSigner(index, "name", e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-sky-500" />
                <input type="email" value={s.email} placeholder="Signer email"
                  onChange={(e) => updateSigner(index, "email", e.target.value)}
                  className="col-start-2 md:col-start-auto border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-sky-500" />
                <div className="col-start-2 md:col-start-auto flex items-center gap-1">
                  <button type="button" onClick={() => moveSigner(index, -1)} disabled={index === 0} title="Move up"
                    className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => moveSigner(index, 1)} disabled={index === signers.length - 1} title="Move down"
                    className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" onClick={() => removeSigner(index)} disabled={signers.length === 1} title="Remove signer"
                    className="p-1.5 rounded text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
            <button type="button" onClick={addSigner} disabled={signers.length >= MAX_SIGNERS}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-white border border-sky-300 hover:bg-sky-50 disabled:opacity-50 rounded transition">
              <Plus size={14} /> Add signer
            </button>
            <button type="button" onClick={handleSendEsign} disabled={isSending}
              className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-semibold shadow transition">
              <Send size={16} />
              {isSending ? "Sending..." : unsentDocs.length > 0 ? `Send ${unsentDocs.join(" & ")} for eSign` : "Send again"}
            </button>
          </div>
        </div>
      )}

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
