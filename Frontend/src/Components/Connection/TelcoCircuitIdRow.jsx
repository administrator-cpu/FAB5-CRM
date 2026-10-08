import React, { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { useConnection } from "../../Context/ConnectionContext";

// Telco Circuit ID row on the connection details page. Admins can change it once the
// connection has been activated (vendors re-issue circuit IDs from time to time).
const TelcoCircuitIdRow = ({ connection, isAdmin, onSaved }) => {
  const { updateTelcoCircuitId } = useConnection();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [value, setValue] = useState("");

  const currentId = connection?.telecoCircuitId;
  const canEdit = isAdmin && Boolean(currentId);

  const startEdit = () => {
    setValue(currentId || "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!value.trim() || value.trim() === currentId) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    const result = await updateTelcoCircuitId(connection._id, { telecoCircuitId: value.trim() });
    setIsSaving(false);
    if (result) {
      setIsEditing(false);
      onSaved?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setIsEditing(false);
  };

  return (
    <div className="flex justify-between items-center gap-2 pt-2 border-t">
      <span className="text-gray-500 shrink-0">Telco Circuit ID:</span>
      {isEditing ? (
        <div className="flex items-center gap-1 min-w-0">
          <input
            type="text"
            value={value}
            autoFocus
            disabled={isSaving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Telco Circuit ID"
            className="font-mono text-xs w-36 bg-white border border-gray-300 rounded px-1.5 py-0.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <button type="button" onClick={handleSave} disabled={isSaving} aria-label="Save Telco Circuit ID" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50">
            <Check size={14} />
          </button>
          <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving} aria-label="Cancel" className="p-1 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-mono text-xs bg-gray-100 px-1 rounded truncate">{currentId || "Pending"}</span>
          {canEdit && (
            <button type="button" onClick={startEdit} aria-label="Edit Telco Circuit ID" title="Edit Telco Circuit ID" className="p-1 text-indigo-600 hover:bg-indigo-50 rounded">
              <Pencil size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TelcoCircuitIdRow;
