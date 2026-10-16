import React, { useState } from "react";
import { InputUnitFlow } from "../Utils/InputUnit";
import { useConnection } from "../../Context/ConnectionContext";
import { useCustomer } from "../../Context/CustomerContext";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Network, MapPin, CreditCard, FileText, UploadCloud, CheckCircle2, MessageSquare } from "lucide-react";
import { INDIAN_STATES } from "../Utils/States";

const init = {
  AbtsId: "", Astreet: "", Acity: "", Astate: "", Apincode: "", Alatitude: "", Alongitude: "",
  BbtsId: "", Bstreet: "", Bcity: "", Bstate: "", Bpincode: "", Blatitude: "", Blongitude: "",
  telcoProvider: "", serviceType: "",
  bandwidth: "", mrc: "", otc: "", advance: "", ratePerMb: "",
  ipCount: "", ipCost: "", RatePerIP: "", remarks: "",
};

const CreateConnection = () => {
  const { createConnection, getConnection } = useConnection();
  const { customerInformation } = useCustomer();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(init);

  // Billing address printed on the generated CAF / PO — chosen per connection.
  const billingProfiles = customerInformation?._id === id ? customerInformation.billingProfile || [] : [];
  const [billingProfileId, setBillingProfileId] = useState("");
  const selectedBillingId = billingProfiles.length === 1 ? billingProfiles[0]._id : billingProfileId;

  const [files, setFiles] = useState({
    businessAgreement: null
  });

  const {
    AbtsId, Astreet, Acity, Astate, Apincode, Alatitude, Alongitude,
    BbtsId, Bstreet, Bcity, Bstate, Bpincode, Blatitude, Blongitude,
    telcoProvider, serviceType, bandwidth,
    otc, advance, ratePerMb, ipCount, RatePerIP, remarks,
  } = data;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setData({ ...data, [name]: value });
  };

  const handleFileChange = (e) => {
    const { name, files: selectedFiles } = e.target;
    setFiles({ ...files, [name]: selectedFiles[0] });
  };

  const calculatedMrc = (Number(bandwidth || 0) * Number(ratePerMb || 0)) + (Number(ipCount || 0) * Number(RatePerIP || 0));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (billingProfiles.length > 1 && !selectedBillingId) return toast.error("Please select a billing address!");

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      const calculatedIpCost = Number(ipCount || 0) * Number(RatePerIP || 0);

      const Aaddress = `${Astreet}, ${Acity}, ${Astate} - ${Apincode}`;
      let Baddress = "";
      if (serviceType !== "ILL") {
        Baddress = `${Bstreet}, ${Bcity}, ${Bstate} - ${Bpincode}`;
      }

      const textPayload = { 
        ...data, 
        Aaddress, 
        Baddress, 
        mrc: calculatedMrc, 
        ipCost: calculatedIpCost 
      };

      delete textPayload.Astreet; delete textPayload.Acity; delete textPayload.Astate; delete textPayload.Apincode;
      delete textPayload.Bstreet; delete textPayload.Bcity; delete textPayload.Bstate; delete textPayload.Bpincode;

      Object.keys(textPayload).forEach(key => {
        formData.append(key, textPayload[key]);
      });

      if (selectedBillingId) formData.append("billingProfileId", selectedBillingId);
      if (files.businessAgreement) formData.append("businessAgreement", files.businessAgreement);
      

      await createConnection(id, formData);
      await getConnection(id);
      toast.success("Connection created successfully!");
      navigate(`/customer/${id}`);

    } catch (error) {
      console.error(error);
      toast.error("Failed to create connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col min-h-screen">
      <div className="max-w-6xl mx-auto w-full py-8 px-4 md:px-8">

        <div className="mb-8">
          <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">Create New Connection</h2>
          <p className="text-slate-500 mt-2">Provision a new circuit and set up commercial billing details.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-8">

          {/* SERVICE SPECIFICATIONS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden hover:shadow-md transition-shadow duration-300">
            <div className="bg-indigo-50/50 border-b border-slate-100 p-5 flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Network size={20} /></div>
              <h3 className="text-lg font-bold text-slate-800">Service Specifications</h3>
            </div>
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Service Type <span className="text-red-500">*</span></label>
                <select name="serviceType" value={serviceType} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" required>
                  <option value="" disabled>Select type...</option>
                  {["DNC", "Mix", "ILL", "Peering"].map((e, i) => <option key={i} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Telecom Provider <span className="text-red-500">*</span></label>
                <select name="telcoProvider" onChange={handleChange} value={telcoProvider} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" required>
                  <option value="" disabled>Select provider...</option>
                  {["Airtel", "TCL", "Vodafone", "Other"].map((e, i) => <option key={i} value={e}>{e}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ENDPOINT LOCATIONS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden hover:shadow-md transition-shadow duration-300">
            <div className="bg-emerald-50/50 border-b border-slate-100 p-5 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><MapPin size={20} /></div>
              <h3 className="text-lg font-bold text-slate-800">Endpoint Locations</h3>
            </div>
            
            <div className="p-6 md:p-8 flex flex-col gap-8">
              
              {/* A-END LOCATION */}
              <div className="bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-4">A-End Location</h4>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputUnitFlow type="text" placeholder="e.g. BTS-1024" name="AbtsId" label="BTS ID" value={AbtsId} change={handleChange} />
                    <InputUnitFlow type="text" placeholder="Enter street address" name="Astreet" label="Street Address" value={Astreet} change={handleChange} required />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <InputUnitFlow type="text" placeholder="City" name="Acity" label="City" value={Acity} change={handleChange} required />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-slate-700">State <span className="text-red-500">*</span></label>
                      <select name="Astate" value={Astate} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" required>
                        <option value="" disabled>Select state...</option>
                        {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                      </select>
                    </div>
                    <InputUnitFlow type="text" placeholder="Pincode" name="Apincode" label="Pincode" value={Apincode} change={handleChange} required />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputUnitFlow type="text" placeholder="e.g. 28.7041" name="Alatitude" label="Latitude" value={Alatitude} change={handleChange} />
                    <InputUnitFlow type="text" placeholder="e.g. 77.1025" name="Alongitude" label="Longitude" value={Alongitude} change={handleChange} />
                  </div>
                </div>
              </div>

              {/* B-END LOCATION */}
              {serviceType !== "ILL" && (
                <div className="bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                  <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-4">B-End Location</h4>
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputUnitFlow type="text" placeholder="e.g. BTS-2048" name="BbtsId" label="BTS ID" value={BbtsId} change={handleChange} />
                      <InputUnitFlow type="text" placeholder="Enter street address" name="Bstreet" label="Street Address" value={Bstreet} change={handleChange} required />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <InputUnitFlow type="text" placeholder="City" name="Bcity" label="City" value={Bcity} change={handleChange} required />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-semibold text-slate-700">State <span className="text-red-500">*</span></label>
                        <select name="Bstate" value={Bstate} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" required>
                          <option value="" disabled>Select state...</option>
                          {INDIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                        </select>
                      </div>
                      <InputUnitFlow type="text" placeholder="Pincode" name="Bpincode" label="Pincode" value={Bpincode} change={handleChange} required />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputUnitFlow type="text" placeholder="e.g. 28.7041" name="Blatitude" label="Latitude" value={Blatitude} change={handleChange} />
                      <InputUnitFlow type="text" placeholder="e.g. 77.1025" name="Blongitude" label="Longitude" value={Blongitude} change={handleChange} />
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          </div>

          {/* COMMERCIALS & BILLING */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden hover:shadow-md transition-shadow duration-300">
            <div className="bg-amber-50/50 border-b border-slate-100 p-5 flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><CreditCard size={20} /></div>
              <h3 className="text-lg font-bold text-slate-800">Commercials & Billing</h3>
            </div>
            <div className="p-6 md:p-8 flex flex-col gap-8">

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">
                  Billing Address {billingProfiles.length > 1 && <span className="text-red-500">*</span>}
                  <span className="text-slate-400 font-normal"> (printed on the CAF & PO)</span>
                </label>
                {billingProfiles.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">No billing address saved for this customer — N/A will be printed.</p>
                ) : (
                  <select value={selectedBillingId} onChange={(e) => setBillingProfileId(e.target.value)} disabled={billingProfiles.length === 1} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:opacity-80" required={billingProfiles.length > 1}>
                    <option value="" disabled>Select billing address...</option>
                    {billingProfiles.map((profile, i) => (
                      <option key={profile._id} value={profile._id}>
                        {[profile.label || `Billing ${i + 1}`, profile.gstNumber || "No GST", [profile.address?.city, profile.address?.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ")}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                <div className="flex items-end gap-2">
                  <div className="flex-1"><InputUnitFlow type="number" placeholder="e.g. 500" name="bandwidth" value={bandwidth} change={handleChange} label="Bandwidth" required /></div>
                  <span className="pb-5 font-medium text-slate-500">Mbps</span>
                </div>
                <InputUnitFlow type="number" placeholder="e.g. 150" value={ratePerMb} change={handleChange} name="ratePerMb" label="Rate Per Mb (₹)" required />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                <InputUnitFlow type="number" placeholder="e.g. 0" name="ipCount" label="Number of IPs" value={ipCount} change={handleChange} />
                <InputUnitFlow type="number" placeholder="e.g. 0" value={RatePerIP} change={handleChange} name="RatePerIP" label="Per IP Cost (₹)" />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Total IP Cost</label>
                  <div className="w-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <span>₹ {(Number(ipCount || 0) * Number(RatePerIP || 0)).toLocaleString('en-IN')}</span>
                    <span className="text-[10px] uppercase bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">Auto</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-100">
                <InputUnitFlow type="number" placeholder="e.g. 150" value={otc} name="otc" change={handleChange} label="One Time Charge (OTC)" />
                <InputUnitFlow type="number" placeholder="e.g. 150" value={advance} change={handleChange} name="advance" label="Advance Payment" />

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700">Calculated MRC</label>
                  <div className="w-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-xl px-4 py-2.5 flex items-center justify-between">
                    <span>₹ {calculatedMrc.toLocaleString('en-IN')}</span>
                    <span className="text-[10px] uppercase bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">Auto</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ADDITIONAL REMARKS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden hover:shadow-md transition-shadow duration-300">
            <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center gap-3">
              <div className="p-2 bg-slate-200 text-slate-600 rounded-lg"><MessageSquare size={20} /></div>
              <h3 className="text-lg font-bold text-slate-800">Additional Remarks</h3>
            </div>
            <div className="p-6 md:p-8">
              <textarea
                name="remarks" value={remarks} onChange={handleChange}
                placeholder="Enter any special instructions or remarks here..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
              ></textarea>
            </div>
          </div>

          {/* DOCUMENTS */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden hover:shadow-md transition-shadow duration-300">
            <div className="bg-blue-50/50 border-b border-slate-100 p-5 flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><FileText size={20} /></div>
              <h3 className="text-lg font-bold text-slate-800">Documents</h3>
            </div>

            <p className="mx-6 md:mx-8 mt-6 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              The CAF and PO are generated automatically after the connection is created. Download them from the connection page,
              get them signed by the customer and upload the signed copies there.
            </p>

            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Business Agreement (Optional) */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Business Agreement <span className="text-slate-400 font-normal">(Opt)</span></label>
                <div className={`relative border-2 border-dashed rounded-xl p-6 transition-all text-center h-full flex flex-col justify-center ${files.businessAgreement ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'}`}>
                  <input type="file" name="businessAgreement" accept=".pdf, image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  {!files.businessAgreement ? (
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <UploadCloud size={24} className="text-slate-400 mb-1" />
                      <p className="text-sm font-semibold text-slate-600">Upload Agreement</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <CheckCircle2 size={24} className="text-emerald-600 mb-1" />
                      <p className="text-sm font-bold text-emerald-800 truncate px-2 max-w-full w-full">{files.businessAgreement.name}</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-xl font-bold text-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98] shadow-md mt-4 mb-[10vh]
              ${isSubmitting ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg text-white"}`}
          >
            {isSubmitting ? (
              <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Provisioning...</>
            ) : "Create Connection"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default CreateConnection;