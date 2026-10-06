import React, { useState } from "react";
import { Pencil, X, Save } from "lucide-react";
import { useConnection } from "../../Context/ConnectionContext";

const FIELDS = [
  { key: "btsId", label: "BTS ID", placeholder: "e.g. BTS-1024" },
  { key: "address", label: "Address", placeholder: "Street, City, State - Pincode", multiline: true },
  { key: "latitude", label: "Latitude", placeholder: "e.g. 28.7041" },
  { key: "longitude", label: "Longitude", placeholder: "e.g. 77.1025" },
];

const toForm = (end = {}) => Object.fromEntries(FIELDS.map(({ key }) => [key, end?.[key] || ""]));

const EndForm = ({ title, values, onChange }) => (
  <div className="bg-gray-50 p-3 rounded border flex flex-col gap-2">
    <h3 className="text-[10px] uppercase font-bold text-indigo-500">{title}</h3>
    {FIELDS.map(({ key, label, placeholder, multiline }) => (
      <label key={key} className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-gray-500">{label}</span>
        {multiline ? (
          <textarea rows={2} value={values[key]} placeholder={placeholder} onChange={(e) => onChange(key, e.target.value)}
            className="w-full text-sm bg-white border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none" />
        ) : (
          <input type="text" value={values[key]} placeholder={placeholder} onChange={(e) => onChange(key, e.target.value)}
            className="w-full text-sm bg-white border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" />
        )}
      </label>
    ))}
  </div>
);

const NetworkTopology = ({ connection, isAdmin, onSaved }) => {
  const { updateTopology } = useConnection();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ aEnd: toForm(), bEnd: toForm() });

  const details = connection?.technicalDetails || {};
  const isIll = connection?.serviceType === "ILL";

  const startEdit = () => {
    setForm({ aEnd: toForm(details.aEnd), bEnd: toForm(details.bEnd) });
    setIsEditing(true);
  };

  const handleChange = (end) => (key, value) => {
    setForm((prev) => ({ ...prev, [end]: { ...prev[end], [key]: value } }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const payload = isIll ? { aEnd: form.aEnd } : { aEnd: form.aEnd, bEnd: form.bEnd };
    const result = await updateTopology(connection._id, payload);
    setIsSaving(false);
    if (result) {
      setIsEditing(false);
      onSaved?.();
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mt-6">
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">Network Topology</h2>
        {isAdmin && !isEditing && (
          <button type="button" onClick={startEdit} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
            <Pencil size={13} /> Edit
          </button>
        )}
        {isAdmin && isEditing && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition">
              <X size={13} /> Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-3 py-1 rounded shadow-sm transition">
              <Save size={13} /> {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className={`grid grid-cols-1 ${isIll ? "" : "md:grid-cols-2"} gap-6`}>
          <EndForm title="A-End Location" values={form.aEnd} onChange={handleChange("aEnd")} />
          {!isIll && <EndForm title="B-End Location" values={form.bEnd} onChange={handleChange("bEnd")} />}
        </div>
      ) : (
        <div className={`grid grid-cols-1 ${isIll ? "md:grid-cols-2" : "md:grid-cols-3"} gap-6`}>
          <div className="bg-gray-50 p-3 rounded border">
            <h3 className="text-[10px] uppercase font-bold text-indigo-500 mb-2">A-End Location</h3>
            <p className="text-sm font-medium text-gray-900 mb-1">BTS: {details.aEnd?.btsId || "Not Assigned"}</p>
            <p className="text-xs text-gray-600">{details.aEnd?.address || "No address provided"}</p>
          </div>

          {!isIll ? (
            <>
              <div className="flex flex-col items-center justify-center text-center p-3">
                <div className="w-full h-px bg-gray-300 mb-2"></div>
                <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  {details.telcoProvider || "Unknown Provider"}
                </span>
                <div className="w-full h-px bg-gray-300 mt-2"></div>
              </div>
              <div className="bg-gray-50 p-3 rounded border">
                <h3 className="text-[10px] uppercase font-bold text-indigo-500 mb-2">B-End Location</h3>
                <p className="text-sm font-medium text-gray-900 mb-1">BTS: {details.bEnd?.btsId || "Not Assigned"}</p>
                <p className="text-xs text-gray-600">{details.bEnd?.address || "No address provided"}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col justify-center items-start p-3">
              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-1 border border-indigo-200">
                {details.telcoProvider || "Unknown"} Provider
              </span>
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Direct to Internet (ILL)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NetworkTopology;
