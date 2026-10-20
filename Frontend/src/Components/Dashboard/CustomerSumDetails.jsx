import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { X } from "lucide-react";

import { useAuth } from "../../Context/AuthContext";
import { useCustomer } from "../../Context/CustomerContext";
import { useConnection } from "../../Context/ConnectionContext";

import CreateConnection from "../Connection/CreateConnection";
import ConnectionList from "../Connection/ConnectionList";
import CustomerHeaderCard from "../Customer/CustomerHeaderCard";
import CustomerBillingSection from "../Customer/CustomerBillingSection";
import CustomerDocumentsSection from "../Customer/CustomerDocumentsSection";
import CustomerDeleteModal from "../Customer/CustomerDeleteModal";
import BillingDeleteModal from "../Customer/BillingDeleteModal"; // Import your new modal

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
  "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const initialFormState = {
  name: "", person: "", email: "", mobile: "", customerType: "", billingProfiles: []
};

const initialBillingForm = {
  label: "",
  gstNumber: "",
  address: { street: "", city: "", state: "", pincode: "" }
};

function CustomerSumDetails() {
  const { getConnection, connectionData } = useConnection();
  const { editCustomer, deleteCustomer, addBillingProfile, editBillingProfile, removeBillingProfile } = useCustomer();
  const { user, allData } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  // Core Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editData, setEditData] = useState(initialFormState);

  // Granular Sub-Document Billing Modals
  const [billingModal, setBillingModal] = useState({ isOpen: false, type: "add", targetProfileId: null });
  const [billingDeleteModal, setBillingDeleteModal] = useState({ isOpen: false, targetProfileId: null, profileLabel: "" });
  const [billingForm, setBillingForm] = useState(initialBillingForm);


  const activeConnections = connectionData || [];

  const getConnect = useCallback(async () => {
    if (!id || !getConnection) return;
    try {
      await getConnection(id);
    } catch (err) {
      console.error("Failed to load connection profiles", err);
    }
  }, [id, getConnection]);

  useEffect(() => {
    getConnect();
  }, [getConnect]);

  const customer = useMemo(() => {
    return allData?.customers?.find(c => c._id === id);
  }, [allData, id]);

  useEffect(() => {
    if (customer) {
      setEditData({
        name: customer.name || "",
        person: customer.person || "",
        email: customer.email || "",
        mobile: customer.mobile || "",
        customerType: customer.customerType || "",
        billingProfiles: customer.billingProfile || customer.billingProfiles || []
      });
    }
  }, [customer, isEditModalOpen]);

  // Main Customer Event Handlers
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.keys(editData).forEach(key => {
        if (key === "billingProfiles") {
          formData.append(key, JSON.stringify(editData[key]));
        } else {
          formData.append(key, editData[key]);
        }
      });
      await editCustomer(id, formData);
      setIsEditModalOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    setIsSubmitting(true);
    try {
      await deleteCustomer(id);
      setIsDeleteModalOpen(false);
      navigate("/dashboard");
    } catch (error) {
      console.error(error);
      setIsSubmitting(false);
    }
  };

  // Granular Billing Operations
  const openAddBilling = () => {
    setBillingForm(initialBillingForm);
    setBillingModal({ isOpen: true, type: "add", targetProfileId: null });
  };

  const openEditBilling = (profile) => {
    setBillingForm({
      label: profile.label || "",
      gstNumber: profile.gstNumber || "",
      address: {
        street: profile.address?.street || "",
        city: profile.address?.city || "",
        state: profile.address?.state || "",
        pincode: profile.address?.pincode || ""
      }
    });
    setBillingModal({ isOpen: true, type: "edit", targetProfileId: profile._id });
  };

  const handleBillingSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (billingModal.type === "add") {
        await addBillingProfile(id, billingForm);
      } else {
        await editBillingProfile(id, billingModal.targetProfileId, billingForm);
      }
      setBillingModal({ isOpen: false, type: "add", targetProfileId: null });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerBillingDeleteConfirm = (profile) => {
    setBillingDeleteModal({
      isOpen: true,
      targetProfileId: profile._id,
      profileLabel: profile.label || ""
    });
  };

const executeBillingDelete = async () => {
  if (!billingDeleteModal.targetProfileId) return; 
  setIsSubmitting(true);
  try {
    await removeBillingProfile(id, billingDeleteModal.targetProfileId);
    setBillingDeleteModal({ isOpen: false, targetProfileId: null, profileLabel: "" }); 
  } catch (err) {
    console.error(err);
  } finally {
    setIsSubmitting(false);
  }
};

  if (!allData) {
    return (
      <div className="flex justify-center p-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-10 text-center text-gray-500">
        <p className="text-xl font-bold">Customer not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 hover:underline">Go Back</button>
      </div>
    );
  }

  const billingList = customer.billingProfile || customer.billingProfiles || [];

  return (
    <section className="w-full flex flex-col gap-4 h-full relative">

      {/* --- MASTER SYSTEM EDIT MODAL --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-xl font-bold text-gray-800">Edit Customer Info</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition">
                <X size={24} />
              </button>
            </div>

            <div className="overflow-y-auto customScroller p-5">
              <form id="editCustomerForm" onSubmit={handleEditSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <h4 className="text-sm font-bold text-indigo-600 uppercase tracking-wider">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold text-gray-600">Company Name</label>
                      <input required type="text" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold text-gray-600">Contact Person</label>
                      <input required type="text" value={editData.person} onChange={(e) => setEditData({ ...editData, person: e.target.value })} className="border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold text-gray-600">Email</label>
                      <input required type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold text-gray-600">Mobile</label>
                      <input required type="text" value={editData.mobile} onChange={(e) => setEditData({ ...editData, mobile: e.target.value })} className="border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold text-gray-600">Customer Type</label>
                      <select onChange={(e) => setEditData({ ...editData, customerType: e.target.value })} className="border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 bg-white" value={editData.customerType}>
                        {["Enterprise", "ISP", "Operator", "Government"].map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-100 flex-shrink-0 bg-slate-50">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition">Cancel</button>
              <button type="submit" form="editCustomerForm" disabled={isSubmitting} className="px-6 py-2 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- GRANULAR ADD/EDIT BILLING MODAL --- */}
      {billingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col overflow-hidden animate-fadeIn">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">
                {billingModal.type === "add" ? "Add Billing Profile" : "Modify Billing Profile"}
              </h3>
              <button onClick={() => setBillingModal({ isOpen: false, type: "add", targetProfileId: null })} className="text-gray-400 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBillingSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Profile Tag Label</label>
                  <input required type="text" placeholder="e.g. Haryana Office" value={billingForm.label} onChange={(e) => setBillingForm({ ...billingForm, label: e.target.value })} className="border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">GST Number</label>
                  <input required type="text" placeholder="15-digit GSTIN" value={billingForm.gstNumber} onChange={(e) => setBillingForm({ ...billingForm, gstNumber: e.target.value.toUpperCase() })} className="border p-2 rounded-lg text-sm font-mono uppercase outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Street Line Address</label>
                <input required type="text" placeholder="Plot No, Industrial Area Area, Locality" value={billingForm.address.street} onChange={(e) => setBillingForm({ ...billingForm, address: { ...billingForm.address, street: e.target.value } })} className="border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">City</label>
                  <input required type="text" placeholder="City" value={billingForm.address.city} onChange={(e) => setBillingForm({ ...billingForm, address: { ...billingForm.address, city: e.target.value } })} className="border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">State</label>
                  <select required value={billingForm.address.state} onChange={(e) => setBillingForm({ ...billingForm, address: { ...billingForm.address, state: e.target.value } })} className="border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 bg-white">
                    <option value="" disabled>State</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Pincode</label>
                  <input required type="text" maxLength={6} placeholder="6 Digits" value={billingForm.address.pincode} onChange={(e) => setBillingForm({ ...billingForm, address: { ...billingForm.address, pincode: e.target.value } })} className="border p-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setBillingModal({ isOpen: false, type: "add", targetProfileId: null })} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100">Discard</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                  Save Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- GRANULAR BILLING DELETE CONFIRMATION CARD POPUP --- */}
      {billingDeleteModal.isOpen && (
        <BillingDeleteModal
          profileLabel={billingDeleteModal.profileLabel}
          isSubmitting={isSubmitting}
          onClose={() => setBillingDeleteModal({ isOpen: false, targetProfileId: null, profileLabel: "" })}
          onConfirm={executeBillingDelete}
        />
      )}

      {/* --- CONFIRM SYSTEM DELETION OVERLAY --- */}
      {isDeleteModalOpen && (
        <CustomerDeleteModal
          customerName={customer.name}
          isSubmitting={isSubmitting}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteSubmit}
        />
      )}

      {/* --- Layout View Sections --- */}
      <CustomerHeaderCard
        customer={customer}
        user={user}
        connectionCount={activeConnections.length}
        onEditClick={() => setIsEditModalOpen(true)}
        onDeleteClick={() => setIsDeleteModalOpen(true)}
        onExport={async () => {
          // xlsx is only downloaded when someone exports.
          const { exportConnectionsToExcel } = await import("../../Services/ExportToExcel");
          exportConnectionsToExcel(activeConnections, customer.name);
        }}
      />

      <CustomerBillingSection
        billingList={billingList}
        onAddClick={openAddBilling}
        onEditClick={openEditBilling}
        onDeleteClick={triggerBillingDeleteConfirm} // Hand off complete subdocument mapping
        userRole={user?.role}
      />

      <CustomerDocumentsSection documents={customer?.documents} userRole={user?.role} />

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">
          Services & Connections ({activeConnections.length})
        </h2>
      </div>

      {activeConnections.length > 0 ? (
        <ConnectionList connections={activeConnections} />
      ) : (
        <CreateConnection />
      )}
    </section>
  );
}

export default CustomerSumDetails;