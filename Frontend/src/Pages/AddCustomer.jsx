import React, { useState, useEffect } from "react";
import { InputUnitFlow } from "../Components/Utils/InputUnit";
import { useCustomer } from "../Context/CustomerContext";
import { Link, useNavigate } from "react-router-dom";
import { SlArrowLeft } from "react-icons/sl";
import toast from "react-hot-toast";
import { User, FileText, MapPin, PlusCircle, Trash2 } from "lucide-react";
import { INDIAN_STATES } from "../Components/Utils/States";

const info = { label: "Primary Billing", gstNumber: "", address: { street: "", pincode: "", city: "", state: "" } }
const addressFields = ["street", "pincode", "city", "state"];


function AddCustomer() {
  const { newCustommer, setNewCustomer, createCustomer, newCustomeInit } = useCustomer();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [billing, setBilling] = useState(
    newCustommer?.billingProfiles?.length > 0
      ? newCustommer.billingProfiles
      : [info]
  );

  useEffect(() => {
    setNewCustomer(prev => ({ ...prev, billingProfiles: billing }));
  }, [billing, setNewCustomer]);

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    setNewCustomer({ ...newCustommer, [name]: value });
  };

  const handleBillingChange = (index, e) => {
    const { name, value } = e.target;
    const updatedBilling = [...billing];

    if (addressFields.includes(name)) {
      updatedBilling[index].address = {
        ...updatedBilling[index].address,
        [name]: value,
      };
    } else {
      updatedBilling[index][name] = value;
    }
    setBilling(updatedBilling);
  };

  const extentBillingAddresses = () => {
    setBilling([...billing, { label: `Billing Address #${billing.length + 1}`, gstNumber: "", address: { street: "", pincode: "", city: "", state: "" } }]);
  };

  const handleDocChange = (type, index, field, value) => {
    const docKey = type === "company" ? "companyDocs" : "signatoryDocs";
    const updatedDocs = [...newCustommer[docKey]];
    updatedDocs[index][field] = value;
    setNewCustomer({ ...newCustommer, [docKey]: updatedDocs });
  };

  const addDocField = (type) => {
    const docKey = type === "company" ? "companyDocs" : "signatoryDocs";
    const defaultType = type === "company" ? "Company PAN" : "PAN";
    setNewCustomer({
      ...newCustommer,
      [docKey]: [...newCustommer[docKey], { file: null, documentType: defaultType }]
    });
  };

  const removeDocField = (type, index) => {
    const docKey = type === "company" ? "companyDocs" : "signatoryDocs";
    const updatedDocs = [...newCustommer[docKey]];
    updatedDocs.splice(index, 1);
    setNewCustomer({ ...newCustommer, [docKey]: updatedDocs });
  };

  const handalSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const hasCompanyFile = newCustommer.companyDocs.some(doc => doc.file !== null);
    const hasSignatoryFile = newCustommer.signatoryDocs.some(doc => doc.file !== null);

    if (!hasCompanyFile) return toast.error("Please upload at least one company document.");
    if (!hasSignatoryFile) return toast.error("Please upload at least one signatory document.");

    if (!billing[0]?.address?.street || !billing[0]?.address?.city) {
      return toast.error("Please provide a complete primary billing address.");
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", newCustommer.name);
      formData.append("person", newCustommer.person);
      formData.append("email", newCustommer.email);
      formData.append("mobile", newCustommer.mobile);
      formData.append("customerType", newCustommer.customerType);

      formData.append("billingProfiles", JSON.stringify(billing));

      newCustommer.companyDocs.forEach((doc) => {
        if (doc.file) {
          formData.append("companyDocuments", doc.file);
          formData.append("companyDocumentsType", doc.documentType);
        }
      });

      newCustommer.signatoryDocs.forEach((doc) => {
        if (doc.file) {
          formData.append("signatoryDocuments", doc.file);
          formData.append("signatoryDocumentsType", doc.documentType);
        }
      });

      const response = await createCustomer(formData);

      if (response?.success || response?.status === 200) {
        navigate("/dashboard");
        setNewCustomer(newCustomeInit);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col h-[90vh] bg-slate-50 overflow-auto customScroller pb-[15vh]">
      <form className="flex flex-col w-full mx-auto  p-4 md:p-8 gap-8" onSubmit={handalSubmit}>

        <div className="flex items-center justify-between">
          <Link to={"/dashboard"} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 hover:bg-slate-100 rounded-lg shadow-sm border border-slate-200 transition-colors font-medium">
            <SlArrowLeft size={14} /> Back to Dashboard
          </Link>
          <h2 className="text-2xl font-samibold text-slate-800 tracking-tight">Onboard New Customer</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-indigo-50 border-b border-slate-200 p-4 flex items-center gap-3">
            <User className="text-indigo-600" size={24} />
            <h3 className="text-xl font-bold text-indigo-950">Customer Details</h3>
          </div>
          <div className="p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputUnitFlow type="text" placeholder="Enter customer name" name="name" label="Company / Customer Name" change={handleCustomerChange} value={newCustommer.name} required />

              <div className="flex flex-col gap-1 mb-4 border-b h-full ">
                <label htmlFor="customerType" className="text-sm font-medium text-slate-700">Customer Type <span className="text-red-500">*</span></label>
                <select
                  name="customerType" id="customerType"
                  onChange={handleCustomerChange}
                  className="w-full outline-none bg-transparent py-2 border-slate-300 focus:border-indigo-500 transition-colors"
                  value={newCustommer.customerType} required
                >
                  <option value="">Select an option</option>
                  {["Enterprise", "ISP", "Operator", "Government"].map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InputUnitFlow type="text" placeholder="Contact person name" name="person" label="Primary Contact Person" change={handleCustomerChange} value={newCustommer.person} required />
              <InputUnitFlow type="text" placeholder="10-digit mobile" name="mobile" maxLength={10} label="Contact Number" change={handleCustomerChange} value={newCustommer.mobile} required />
              <InputUnitFlow type="email" placeholder="Official email address" name="email" label="Contact Email" change={handleCustomerChange} value={newCustommer.email} required />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-emerald-50 border-b border-slate-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-emerald-600" size={24} />
              <h3 className="text-xl font-bold text-emerald-950">KYC Documents</h3>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="text-lg font-semibold text-slate-800">Company Documents</h4>
                <button type="button" onClick={() => addDocField("company")} className="flex items-center gap-1 text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                  <PlusCircle size={16} /> Add More
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {newCustommer?.companyDocs?.map((doc, i) => (
                  <div key={`comp-${doc.documentType}-${i}`} className="flex flex-col md:flex-row gap-4 items-center bg-slate-50 border border-slate-200 p-3 rounded-xl hover:border-emerald-300 transition-colors">
                    <select
                      value={doc.documentType}
                      onChange={(e) => handleDocChange("company", i, "documentType", e.target.value)}
                      className="p-2 border border-slate-300 rounded-lg outline-none bg-white w-full md:w-64 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-shadow"
                    >
                      <option value="Incorporation Certificate">Incorporation Certificate</option>
                      <option value="Company PAN">Company PAN</option>
                      <option value="ISP License">ISP License</option>
                    </select>
                    <input
                      type="file"
                      accept=".pdf, application/pdf"
                      onChange={(e) => handleDocChange("company", i, "file", e.target.files[0])}
                      className="flex-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all cursor-pointer"
                      required={i === 0}
                    />
                    {i > 0 && (
                      <button type="button" onClick={() => removeDocField("company", i)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Remove Document">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="text-lg font-semibold text-slate-800">Signatory Documents</h4>
                <button type="button" onClick={() => addDocField("signatory")} className="flex items-center gap-1 text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
                  <PlusCircle size={16} /> Add More
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {newCustommer.signatoryDocs?.map((doc, i) => (
                  <div key={`sig-${doc.documentType}-${i}`} className="flex flex-col md:flex-row gap-4 items-center bg-slate-50 border border-slate-200 p-3 rounded-xl hover:border-emerald-300 transition-colors">
                    <select
                      value={doc.documentType}
                      onChange={(e) => handleDocChange("signatory", i, "documentType", e.target.value)}
                      className="p-2 border border-slate-300 rounded-lg outline-none bg-white w-full md:w-64 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-shadow"
                    >
                      <option value="PAN">PAN</option>
                      <option value="AADHAAR">AADHAAR</option>
                    </select>
                    <input
                      type="file"
                      accept=".pdf, application/pdf"
                      onChange={(e) => handleDocChange("signatory", i, "file", e.target.files[0])}
                      className="flex-1 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all cursor-pointer"
                      required={i === 0}
                    />
                    {i > 0 && (
                      <button type="button" onClick={() => removeDocField("signatory", i)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Remove Document">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3 px-2">
            <MapPin className="text-slate-500" size={24} />
            <h3 className="text-2xl font-bold text-slate-800">Billing Information</h3>
          </div>

          {billing?.map((item, i) => (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 relative group" key={`bill-${item.label}`}>

              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                <h3 className="text-lg font-bold text-slate-800">
                  {i === 0 ? "Primary Billing Address" : `Additional Billing Profile #${i + 1}`}
                </h3>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setBilling(billing.filter((_, index) => index !== i))}
                    className="text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <InputUnitFlow type="text" placeholder="e.g. Head Office, Branch 1" name="label" label="Profile Label / Nickname" value={item.label} change={(e) => handleBillingChange(i, e)} required />
                <InputUnitFlow type="text" placeholder="Enter GST Number (Optional)" required={false} name="gstNumber" label="GST Number (Optional)" value={item.gstNumber} change={(e) => handleBillingChange(i, e)} />
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4">Location Details</h4>
                <div className="flex flex-col gap-4">
                  <InputUnitFlow type="text" placeholder="Enter street Address" name="street" label="Street Address" value={item.address?.street || ""} change={(e) => handleBillingChange(i, e)} required />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <InputUnitFlow type="text" placeholder="Enter city" name="city" label="City" value={item.address?.city || ""} change={(e) => handleBillingChange(i, e)} required />
                    <select
                      name="state" id={`state-${i}`}
                      onChange={(e) => handleBillingChange(i, e)} required
                      className="w-full outline-none bg-transparent py-2 border-slate-300 focus:border-indigo-500 transition-colors"
                      value={item.address?.state || ""}
                    >
                      <option value="">Select State</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>{state}</option>
                      ))}

                    </select>
                    {/* <InputUnitFlow type="text" placeholder="Enter state" name="state" label="State" value={item.address?.state || ""} change={(e) => handleBillingChange(i, e)} required /> */}
                    <InputUnitFlow type="text" placeholder="Enter pincode" name="pincode" label="Pincode" value={item.address?.pincode || ""} change={(e) => handleBillingChange(i, e)} required />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-col md:flex-row justify-between gap-4 mt-4">
            <button
              type="button"
              onClick={extentBillingAddresses}
              className="flex items-center justify-center gap-2 p-4 text-indigo-700 bg-indigo-50 border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100 rounded-xl font-bold transition-colors active:scale-[0.98]"
            >
              <PlusCircle size={20} /> Add Another Billing Address
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 p-4 text-lg rounded-xl text-white font-bold shadow-lg transition-all active:scale-[0.98]
                ${isSubmitting ? "bg-blue-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl"}`}
            >
              {isSubmitting ? "Processing Submission..." : "Complete Customer Onboarding"}
            </button>
          </div>
        </div>

      </form>
    </section>
  );
}

export default AddCustomer;