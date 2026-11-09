import React, { useState } from "react";
import { Send, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";

// Shared eSign (e-Hastakshar) pieces used by the Signing Documents, RMACD and bulk batch cards.
// Only shown to admins and the employee managing the customer.

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

// Status of one eSign request: sent (with expiry), signed by everyone, or declined / expired.
export const EsignStatusNote = ({ esign }) => (
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
);

/**
 * Signer list (in signing order, up to MAX_SIGNERS) with a send button.
 * onSend(signers) does the request and resolves truthy on success.
 */
export const EsignSignerForm = ({ defaultSigner, sendLabel, onSend, description }) => {
  // Signing order: e-Hastakshar emails each signer only after the one above has signed.
  const [signers, setSigners] = useState([{ name: defaultSigner?.name || "", email: defaultSigner?.email || "" }]);
  const [isSending, setIsSending] = useState(false);

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

  const handleSend = async () => {
    const missing = signers.findIndex((s) => !s.name.trim() || !s.email.trim());
    if (missing >= 0) return toast.error(`Enter signer ${missing + 1}'s name and email`);
    const emails = signers.map((s) => s.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) return toast.error("Each signer needs a different email");
    setIsSending(true);
    await onSend(signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })));
    setIsSending(false);
  };

  return (
    <div className="p-4 border border-sky-200 bg-sky-50/50 rounded-lg">
      <p className="text-xs font-bold text-gray-700 mb-1">eSign with e-Hastakshar</p>
      <p className="text-[11px] text-gray-500 mb-3">
        Signers sign in this order: signer 1 gets the signing link and OTP by email first, and each next
        signer is emailed only after the one before has signed. {description}
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
        <button type="button" onClick={handleSend} disabled={isSending}
          className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-semibold shadow transition">
          <Send size={16} />
          {isSending ? "Sending..." : sendLabel}
        </button>
      </div>
    </div>
  );
};
