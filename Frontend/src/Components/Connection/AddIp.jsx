import React, { useState } from "react";
import { InputUnitFlow } from "../Utils/InputUnit";
import { useParams, useNavigate } from "react-router-dom";
import { useConnection } from "../../Context/ConnectionContext";
import toast from "react-hot-toast";
import { UploadCloud, CheckCircle2, Server, ArrowLeft, MessageSquare } from "lucide-react";

function AddIp() {
  const { addIp } = useConnection();
  const { cid } = useParams();
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poFile, setPoFile] = useState(null);
  
  // Added 'remarks' to state to match backend req.body
  const [data, setData] = useState({
    count: "",
    cost: "",
    remarks: ""
  });
  
  const { count, cost, remarks } = data;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setData({ ...data, [name]: value });
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setPoFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!poFile) {
      toast.error("A Purchase Order (PO) document is mandatory to allocate new IPs.");
      return;
    }

    if (!count || !cost) {
      toast.error("Please provide both the number of IPs and the charges.");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("count", count);
      formData.append("cost", cost);
      
      // Append remarks if the user provided any
      if (remarks.trim()) {
        formData.append("remarks", remarks.trim());
      }
      
      // Append the file (backend expects req.files.purchaseOrder)
      formData.append("purchaseOrder", poFile);

      await addIp(cid, formData);
      toast.success("IP addition request submitted — awaiting approval!");
      navigate(-1); 
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className=" flex justify-center items-center bg-slate-50/50">
      
      <div className="w-full  bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        
        <div className="bg-gradient-to-r from-blue-50 to-white p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl shadow-sm">
            <Server size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Allocate Additional IPs</h2>
            <p className="text-sm text-slate-500 mt-1">Assign new public IPs to this connection. This will move the connection back to Pending status for approval.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 flex flex-col gap-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputUnitFlow
              type="number"
              placeholder="e.g. 4"
              name="count"
              label="Number of IPs"
              change={handleChange}
              value={count}
              required
            />
            <InputUnitFlow
              type="number"
              placeholder="e.g. 2000"
              name="cost"
              label="Total IP Charge (₹)"
              change={handleChange}
              value={cost}
              required
            />
          </div>

          {Number(count) > 0 && Number(cost) > 0 && (
            <p className="text-sm text-slate-600 -mt-4">
              Per IP Cost: <span className="font-semibold text-slate-800">₹ {(Number(cost) / Number(count)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="remarks" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <MessageSquare size={16} className="text-slate-400"/> Remarks <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              name="remarks"
              id="remarks"
              rows={3}
              placeholder="Add any specific notes or context for this IP addition..."
              value={remarks}
              onChange={handleChange}
              className="w-full bg-white border border-slate-300 rounded-xl p-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none shadow-sm"
            ></textarea>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-700">
              Purchase Order (PO) Document <span className="text-red-500">*</span>
            </label>
            
            <div className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 text-center ${poFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'}`}>
              <input 
                type="file" 
                accept=".pdf, application/pdf"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                required
              />
              
              {!poFile ? (
                <div className="flex flex-col items-center gap-3 pointer-events-none">
                  <div className="p-3 bg-white rounded-full shadow-sm text-blue-500">
                    <UploadCloud size={28} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-700">Click or drag to upload PO</p>
                    <p className="text-xs text-slate-500">PDF files only (Max 5MB)</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <div className="p-2 bg-emerald-100 rounded-full text-emerald-600">
                    <CheckCircle2 size={32} />
                  </div>
                  <p className="text-sm font-bold text-emerald-800 truncate px-4 max-w-xs">{poFile.name}</p>
                  <p className="text-xs text-emerald-600 font-medium">Ready to submit</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={16} /> Cancel
            </button>
            
            <button 
              type="submit" 
              disabled={isSubmitting || !poFile || !count || !cost}
              className={`px-8 py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-[0.98] flex items-center justify-center ${
                (!poFile || !count || !cost)
                  ? "bg-slate-300 cursor-not-allowed shadow-none text-slate-500" 
                  : isSubmitting
                    ? "bg-blue-400 cursor-wait"
                    : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg"
              }`}
            >
              {isSubmitting ? "Submitting Request..." : "Request IP Allocation"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default AddIp;