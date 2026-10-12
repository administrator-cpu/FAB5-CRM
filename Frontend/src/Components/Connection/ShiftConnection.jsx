import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useConnection } from "../../Context/ConnectionContext";
import { InputUnitFlow } from "../Utils/InputUnit";
import toast from "react-hot-toast";
import { MapPin, FileText, ArrowDown, MessageSquare } from "lucide-react";
import { INDIAN_STATES } from "../Utils/States";

// Updated init state with latitude and longitude fields
const init = {
  ABtsId: "", Astreet: "", Acity: "", Astate: "", Apincode: "", Alatitude: "", Alongitude: "",
  BBtsId: "", Bstreet: "", Bcity: "", Bstate: "", Bpincode: "", Blatitude: "", Blongitude: "",
  otc: "",
  remarks: "",
};

function ShiftConnection({ info }) {
  const { patchConnection } = useConnection();
  const { cid } = useParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [data, setData] = useState(init);

  const { 
    ABtsId, Astreet, Acity, Astate, Apincode, Alatitude, Alongitude,
    BBtsId, Bstreet, Bcity, Bstate, Bpincode, Blatitude, Blongitude,
    otc, remarks 
  } = data;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setData({ ...data, [name]: value });
  };

  // Dynamically check if the user is editing either end
  const isEditingA = Boolean(ABtsId || Astreet || Acity || Astate || Apincode || Alatitude || Alongitude);
  const isEditingB = Boolean(BBtsId || Bstreet || Bcity || Bstate || Bpincode || Blatitude || Blongitude);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isEditingA && !isEditingB) {
      toast.error("Please provide at least one new BTS ID or Address to shift.");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      
      // Combine split fields back into the format the backend expects
      const finalAaddress = (Astreet || Acity || Astate || Apincode) 
        ? `${Astreet || ""}, ${Acity || ""}, ${Astate || ""} - ${Apincode || ""}` 
        : "";
        
      const finalBaddress = (Bstreet || Bcity || Bstate || Bpincode) 
        ? `${Bstreet || ""}, ${Bcity || ""}, ${Bstate || ""} - ${Bpincode || ""}` 
        : "";

      // Append A-End Data
      if (ABtsId) formData.append("ABtsId", ABtsId);
      if (finalAaddress) formData.append("Aaddress", finalAaddress);
      if (Alatitude) formData.append("Alatitude", Alatitude);
      if (Alongitude) formData.append("Alongitude", Alongitude);

      // Append B-End Data
      if (BBtsId) formData.append("BBtsId", BBtsId);
      if (finalBaddress) formData.append("Baddress", finalBaddress);
      if (Blatitude) formData.append("Blatitude", Blatitude);
      if (Blongitude) formData.append("Blongitude", Blongitude);
      
      // Commercials & Remarks
      if (otc) formData.append("otc", otc);
      if (remarks.trim()) formData.append("remarks", remarks.trim());

      await patchConnection(cid, formData);
      toast.success("Shift request submitted — awaiting approval!");
      
      setData(init);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200 shadow-sm mt-4">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-800">Shift Connection</h2>
        <p className="text-slate-500 text-sm mt-1">Move A-End or B-End to a new location. A new Purchase Order is required.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Side: Input Form & File Upload */}
        <div className="lg:w-[55%] flex flex-col gap-8">
          <form id="shiftForm" onSubmit={handleSubmit} className="flex flex-col gap-6">
            
            {/* Shifting Details */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-6">
              <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                <MapPin size={18} className="text-indigo-500" /> New Location Details
              </h3>
              
              <div className="flex flex-col gap-6">
              {/* A-End Group */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-4">
                  <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Shift A-End</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputUnitFlow type="text" placeholder="e.g. BTS-1042-XYZ" value={ABtsId} change={handleChange} name="ABtsId" label="New A-End BTS ID" required={isEditingA} />
                    <InputUnitFlow type="text" placeholder="Enter street address" value={Astreet} change={handleChange} name="Astreet" label="Street Address" required={isEditingA} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <InputUnitFlow type="text" placeholder="City" name="Acity" label="City" value={Acity} change={handleChange} required={isEditingA} />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-700">State {isEditingA && <span className="text-red-500">*</span>}</label>
                      <select name="Astate" value={Astate} onChange={handleChange} required={isEditingA} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm">
                        <option value="" disabled>Select state...</option>
                        {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                      </select>
                    </div>
                    <InputUnitFlow type="text" placeholder="Pincode" name="Apincode" label="Pincode" value={Apincode} change={handleChange} required={isEditingA} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InputUnitFlow type="text" placeholder="e.g. 28.7041" name="Alatitude" label="Latitude" value={Alatitude} change={handleChange} required={false} />
                    <InputUnitFlow type="text" placeholder="e.g. 77.1025" name="Alongitude" label="Longitude" value={Alongitude} change={handleChange} required={false} />
                  </div>
                </div>

                {/* B-End Group */}
                {info?.serviceType !== "ILL" && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-4">
                    <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Shift B-End</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <InputUnitFlow type="text" placeholder="e.g. BTS-8921-ABC" value={BBtsId} change={handleChange} name="BBtsId" label="New B-End BTS ID" required={isEditingB} />
                      <InputUnitFlow type="text" placeholder="Enter street address" value={Bstreet} change={handleChange} name="Bstreet" label="Street Address" required={isEditingB} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <InputUnitFlow type="text" placeholder="City" name="Bcity" label="City" value={Bcity} change={handleChange} required={isEditingB} />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-semibold text-slate-700">State {isEditingB && <span className="text-red-500">*</span>}</label>
                        <select name="Bstate" value={Bstate} onChange={handleChange} required={isEditingB} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm">
                          <option value="" disabled>Select state...</option>
                          {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                        </select>
                      </div>
                      <InputUnitFlow type="text" placeholder="Pincode" name="Bpincode" label="Pincode" value={Bpincode} change={handleChange} required={isEditingB} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <InputUnitFlow type="text" placeholder="e.g. 28.7041" name="Blatitude" label="Latitude" value={Blatitude} change={handleChange} required={false} />
                      <InputUnitFlow type="text" placeholder="e.g. 77.1025" name="Blongitude" label="Longitude" value={Blongitude} change={handleChange} required={false} />
                    </div>
                  </div>
                )}
                
                <div className="pt-2 grid grid-cols-1 gap-6">
                  <InputUnitFlow
                    type="number"
                    placeholder="e.g. 5000"
                    value={otc}
                    change={handleChange}
                    name="otc"
                    label="Shifting Charges (OTC) ₹"
                    required={false}
                  />

                  {/* Remarks Field */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="remarks" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <MessageSquare size={16} className="text-slate-400"/> Remarks <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <textarea
                      name="remarks"
                      id="remarks"
                      rows={3}
                      placeholder="Add any specific notes or context for this shifting request..."
                      value={remarks}
                      onChange={handleChange}
                      className="w-full bg-white border border-slate-300 rounded-xl p-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none shadow-sm"
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>

            {/* RMACD note */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 shrink-0">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">RMACD Form (Charge Deviation Form)</h3>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                  The RMACD form is generated automatically when you submit. Download it from the connection page,
                  get it signed by the customer and upload the signed copy there — the request can be approved only after that.
                </p>
              </div>
            </div>
          </form>
        </div>

        {/* Right Side: Current Status Summary & Button */}
        <div className="flex-1 flex flex-col gap-6">
          
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-6 shadow-inner relative">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Current Network Topology</h3>
            
            <div className="flex flex-col gap-5 text-sm">
              <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider block mb-1">A-End Location</span>
                <span className="font-bold text-slate-800 text-base block">{info?.technicalDetails?.aEnd?.btsId || "Not Assigned"}</span>
                <span className="text-xs text-slate-500 mt-1 block leading-relaxed">{info?.technicalDetails?.aEnd?.address || "No address on file"}</span>
              </div>
              
              {info?.serviceType !== "ILL" && (
                <>
                  <div className="flex justify-center -my-2 z-10">
                    <div className="bg-slate-200 rounded-full p-1 border-4 border-slate-100">
                      <ArrowDown size={16} className="text-slate-500 rotate-90 md:rotate-0" />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider block mb-1">B-End Location</span>
                    <span className="font-bold text-slate-800 text-base block">{info?.technicalDetails?.bEnd?.btsId || "Not Assigned"}</span>
                    <span className="text-xs text-slate-500 mt-1 block leading-relaxed">{info?.technicalDetails?.bEnd?.address || "No address on file"}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button 
            type="submit" 
            form="shiftForm"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-xl font-bold text-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98] mt-auto ${
              isSubmitting 
                  ? "bg-indigo-400 text-white cursor-wait" 
                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg"
            }`}
          >
            {isSubmitting ? "Processing Request..." : "Submit Shift Request"}
          </button>

        </div>
      </div>
    </section>
  );
}

export default ShiftConnection;