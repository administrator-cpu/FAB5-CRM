import React, { useEffect, useState } from "react";
import { InputUnitFlow } from "../Utils/InputUnit";
import { useConnection } from "../../Context/ConnectionContext";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { FileText, ArrowDown, MessageSquare, Info } from "lucide-react";

function EditConnection({ info }) {
  const { putConnection } = useConnection();
  const { cid } = useParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const init = {
    serviceType: info?.serviceType || "",
    bandwidth: info?.bandwidth || "",
    ratePerMb: info?.commercials?.ratePerMb || "",
    remarks: "",
  };

  const [data, setData] = useState(init);
  const [prevInfo, setPrevInfo] = useState(info);

  const { serviceType, bandwidth, ratePerMb, remarks } = data;
  const currentBandwidth = Number(info?.bandwidth || 0);
  const newBandwidth = Number(bandwidth || 0);
  const currentRatePerMb = Number(info?.commercials?.ratePerMb || 0);
  const newRatePerMb = Number(ratePerMb || 0);

  const hasBandwidthChanged = currentBandwidth !== newBandwidth;
  const hasRateChanged = currentRatePerMb !== newRatePerMb;
  const hasChanges = hasBandwidthChanged || hasRateChanged;
  
  // Bandwidth changes (upgrade / downgrade) get an auto-generated RMACD; rate-only changes are rate revisions.
  const isBandwidthChange = hasBandwidthChanged;

  const currentMrc = info?.commercials?.mrc || 0;
  const currentIpCost = info?.ips?.cost || 0;
  const newMrc = (newBandwidth * newRatePerMb) + currentIpCost;

  if (info !== prevInfo) {
    setPrevInfo(info);
    setData({
      serviceType: info?.serviceType || "",
      bandwidth: info?.bandwidth || "",
      ratePerMb: info?.commercials?.ratePerMb || "",
      remarks: "",
    });
  }

  // useEffect(() => {
  //   setData({
  //     serviceType: info?.serviceType || "",
  //     bandwidth: info?.bandwidth || "",
  //     ratePerMb: info?.commercials?.ratePerMb || "",
  //     remarks: "",
  //   });
  //   setPoFile(null);
  // }, [info]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setData({ ...data, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!hasChanges) {
      toast.error("No changes detected.");
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("serviceType", serviceType);
      formData.append("bandwidth", bandwidth);
      formData.append("ratePerMb", ratePerMb);
      formData.append("mrc", newMrc);
      
      if (remarks.trim()) {
        formData.append("remarks", remarks.trim());
      }

      await putConnection(cid, formData);
      toast.success(!isBandwidthChange ? "Rate revision requested successfully!" : "Order modification requested successfully!");
      setData(prev => ({ ...prev, remarks: "" })); 
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDelta = (oldVal, newVal, suffix = "") => {
    const diff = Number(newVal) - Number(oldVal);
    if (diff === 0 || isNaN(diff)) return null;
    return (
      <span className={`text-xs font-bold ml-2 ${diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
        ({diff > 0 ? '+' : ''}{diff}{suffix})
      </span>
    );
  };

  // Determine button state and text
  const isButtonDisabled = !hasChanges || isSubmitting;
  let buttonText = "Confirm & Submit Modification";
  if (!hasChanges) buttonText = "No Changes Made";
  else if (isSubmitting) buttonText = "Processing...";

  return (
    <section className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200 shadow-sm mt-4">
      <div className="mb-6 border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-bold text-slate-800">Modify Connection Request</h2>
        <p className="text-slate-500 text-sm mt-1">Upgrade/Downgrade bandwidth or revise rates.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8">
        
        <div className="lg:w-[55%] flex flex-col gap-8">
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-6">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500"></div> Configuration
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col">
                <InputUnitFlow
                  type={"number"}
                  placeholder={"e.g. 500"}
                  name={"bandwidth"}
                  value={bandwidth}
                  change={handleChange}
                  label={"New Bandwidth (Mbps)"}
                  required
                />
              </div>
              
              <div className="flex flex-col">
                <InputUnitFlow
                  type={"number"}
                  placeholder={"e.g. 150"}
                  value={ratePerMb}
                  change={handleChange}
                  name={"ratePerMb"}
                  label={"New Rate Per Mb (₹)"}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <label htmlFor="remarks" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MessageSquare size={16} className="text-slate-400"/> Remarks <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                name="remarks"
                id="remarks"
                rows={2}
                placeholder="Add notes regarding this modification..."
                value={remarks}
                onChange={handleChange}
                className="w-full bg-white border border-slate-300 rounded-xl p-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none shadow-sm"
              ></textarea>
            </div>
          </div>

          {/* DYNAMIC DOCUMENT SECTION based on changes */}
          {!hasChanges ? (
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
              <div className="p-2 bg-slate-200 rounded-lg text-slate-500 shrink-0">
                <Info size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-700">Modify Values to Continue</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Change the bandwidth or rate per Mb above to see document requirements and submit modifications.
                </p>
              </div>
            </div>
          ) : !isBandwidthChange ? (
            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 shadow-sm flex items-start gap-4">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600 shrink-0">
                <Info size={24} />
              </div>
              <div>
                <h3 className="font-bold text-indigo-900">Rate Revision Mode</h3>
                <p className="text-sm text-indigo-700 mt-1 leading-relaxed">
                  Because the bandwidth has not changed, this is processed as a Rate Revision. A new Purchase Order document is <strong>not required</strong>.
                </p>
              </div>
            </div>
          ) : (
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
          )}

        </div>

        <div className="flex-1 flex flex-col gap-6">
          
          <div className="flex flex-col gap-4 relative">
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-5 shadow-inner">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Current Configuration</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Bandwidth</span>
                  <span className="font-semibold text-slate-800">{currentBandwidth} Mbps</span>
                </div>
                <div className="flex justify-between">
                  <span>Rate per Mb</span>
                  <span className="font-semibold text-slate-800">₹{currentRatePerMb}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span>Monthly Recurring</span>
                  <span className="font-bold text-slate-800">₹{currentMrc}</span>
                </div>
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm z-10 hidden lg:flex">
              <ArrowDown size={16} className="text-slate-400" />
            </div>

            <div className={`border rounded-xl p-5 shadow-sm transition-colors ${hasChanges ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${hasChanges ? 'text-indigo-500' : 'text-slate-400'}`}>
                Proposed Configuration
              </h3>
              <div className={`space-y-3 text-sm ${hasChanges ? 'text-indigo-900' : 'text-slate-500'}`}>
                <div className="flex justify-between items-center">
                  <span>Bandwidth</span>
                  <div>
                    <span className="font-bold">{newBandwidth} Mbps</span>
                    {renderDelta(currentBandwidth, newBandwidth, 'M')}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span>Rate per Mb</span>
                  <div>
                    <span className="font-bold">₹{newRatePerMb}</span>
                    {renderDelta(currentRatePerMb, newRatePerMb)}
                  </div>
                </div>
                <div className={`flex justify-between items-center pt-2 border-t ${hasChanges ? 'border-indigo-200/60' : 'border-slate-200'}`}>
                  <span className="font-semibold">New MRC</span>
                  <div>
                    <span className="font-extrabold text-lg text-indigo-700">₹{newMrc}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isButtonDisabled}
            className={`w-full py-4 rounded-xl font-bold text-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98] ${
              isButtonDisabled
                ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg"
            }`}
          >
            {buttonText}
          </button>

        </div>
      </form>
    </section>
  );
}

export default EditConnection;