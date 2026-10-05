import React, { useState } from "react";
import toast from "react-hot-toast";
import { useConnection } from "../../Context/ConnectionContext";
import { useParams } from "react-router-dom";

function BulkConnectionUpload({ customerId }) {
  const { downloadBulkTemplate, previewBulkUpload, createBulkConnections } = useConnection();

  // State
  const [excelFile, setExcelFile] = useState(null);
  const [validRows, setValidRows] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {id}=useParams()

  // Documents
  const [poFile, setPoFile] = useState(null);
  const [cafFile, setCafFile] = useState(null);
  const [agreementFile, setAgreementFile] = useState(null);

  // --- API 1: Trigger Download from Context ---
  const handleDownload = async () => {
    await downloadBulkTemplate();
  };

  // --- API 2: Preview & Validate ---
  const handlePreviewUpload = async (e) => {
    e.preventDefault();
    if (!excelFile) return toast.error("Please select an Excel file first!");

    setIsPreviewing(true);
    const formData = new FormData();
    formData.append("file", excelFile);

    // Call context method
    const response = await previewBulkUpload(formData);
    
    
    if (response) {
      setValidRows(response.validRows || []);
      setInvalidRows(response.invalidRows || []);
    }
    setIsPreviewing(false);
  };

  // --- API 3: Final Submit ---
  const handleFinalSubmit = async (e) => {
    e.preventDefault();

    if (invalidRows.length > 0) return toast.error("Fix the red errors first!");
    if (!poFile) return toast.error("PO document is required!");
    if (validRows.length === 0) return toast.error("No valid data to submit.");

    setIsSubmitting(true);
    const formData = new FormData();

    formData.append("purchaseOrder", poFile);
    if (cafFile) formData.append("caf", cafFile);
    if (agreementFile) formData.append("businessAgreement", agreementFile);

    // Stringify the array as discussed!
    formData.append("connections", JSON.stringify(validRows));

    // Call context method
    const success = await createBulkConnections(id, formData);

    
    if (success) {
      // Reset everything on success
      setExcelFile(null);
      setValidRows([]);
      setInvalidRows([]);
      setPoFile(null);
      setCafFile(null);
      setAgreementFile(null);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 bg-white rounded-lg shadow-sm">
      
      {/* STEP 1: DOWNLOAD */}
      <section className="p-5 border border-gray-200 rounded-lg bg-gray-50">
        <h2 className="text-xl font-bold mb-3 text-gray-800">Step 1: Get the Format</h2>
        <button type="button" onClick={handleDownload} className="bg-blue-600 text-white px-5 py-2.5 rounded-md font-medium hover:bg-blue-700 transition">
          Download Excel Template
        </button>
      </section>

      {/* STEP 2: PREVIEW */}
      <section className="p-5 border border-gray-200 rounded-lg">
        <h2 className="text-xl font-bold mb-3 text-gray-800">Step 2: Validate Data</h2>
        <form onSubmit={handlePreviewUpload} className="flex gap-4 items-center">
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={(e) => setExcelFile(e.target.files[0])} 
            className="border p-2 rounded w-full max-w-sm cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <button 
            type="submit" 
            disabled={isPreviewing}
            className="bg-yellow-500 text-white px-5 py-2.5 rounded-md font-medium hover:bg-yellow-600 disabled:opacity-60"
          >
            {isPreviewing ? "Validating..." : "Validate Excel"}
          </button>
        </form>

        {/* Validation Report Table */}
        {(validRows.length > 0 || invalidRows.length > 0) && (
          <div className="mt-6">
            <h3 className="font-bold text-gray-700 mb-2">Validation Report:</h3>
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-3 border-b">Row</th>
                    <th className="p-3 border-b">Status</th>
                    <th className="p-3 border-b">Details / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invalidRows.map((row) => (
                    /* FIX APPLIED: Used rowNumber instead of idx */
                    <tr key={`inv-${row.rowNumber}`} className="bg-red-50">
                      <td className="p-3 text-red-600 font-bold">{row.rowNumber || '-'}</td>
                      <td className="p-3 text-red-600 font-semibold">❌ Failed</td>
                      <td className="p-3 text-red-600">
                        <ul className="list-disc pl-4">
                          {row.errors?.map((err, i) => <li key={err}>{err}</li>)}
                        </ul>
                      </td>
                    </tr>
                  ))}
                  {validRows.map((row) => (
                    /* FIX APPLIED: Used rowNumber instead of idx */
                    <tr key={`val-${row.rowNumber}`} className="bg-green-50">
                      <td className="p-3 text-green-700">{row.rowNumber || '-'}</td>
                      <td className="p-3 text-green-700 font-semibold">✅ Valid</td>
                      <td className="p-3 text-green-700 text-xs font-mono text-gray-500 truncate max-w-xs">
                        Ready to process
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* STEP 3: FINAL CREATE */}
      {(validRows.length > 0 || invalidRows.length > 0) && (
        <section className={`p-5 border border-gray-200 rounded-lg ${invalidRows.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-xl font-bold mb-4 text-gray-800">Step 3: Upload Mandatory Documents & Submit</h2>
          
          {invalidRows.length > 0 && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              <strong>Wait!</strong> You have invalid rows. Please fix your Excel file and run Step 2 again.
            </div>
          )}

          <form onSubmit={handleFinalSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">Purchase Order (PO) *</label>
              <input type="file" required onChange={(e) => setPoFile(e.target.files[0])} accept=".pdf, application/pdf" className="border p-2 rounded" />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">CAF Document <span className="text-gray-400 font-normal">(Optional — auto-generated per connection if empty)</span></label>
              <input type="file" onChange={(e) => setCafFile(e.target.files[0])} accept=".pdf, application/pdf" className="border p-2 rounded" />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-700">Business Agreement (Optional)</label>
              <input type="file" onChange={(e) => setAgreementFile(e.target.files[0])} accept=".pdf, application/pdf" className="border p-2 rounded" />
            </div>

            <div className="md:col-span-2 mt-4">
              <button 
                type="submit" 
                disabled={isSubmitting || invalidRows.length > 0}
                className="w-full bg-[#009FF3] text-white px-6 py-3 rounded-md font-bold text-lg hover:bg-[#007acc] disabled:bg-gray-400 transition"
              >
                {isSubmitting ? "Creating..." : `Create ${validRows.length} Connections Now`}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

export default BulkConnectionUpload;