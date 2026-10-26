import React, { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { customerService } from "../Services/customerService";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext";
import { handleRequest } from "../Services/handleRequest";

const CustomerApi = createContext();

const newCustomeInit = {
  name: "",
  person: "",
  email: "",
  mobile: "",
  customerType: "",
  isGST: "",
  billingProfiles: {
    label: "",
    gstNumber: "",
    address: { street: "", city: "", state: "", pincode: "" },
  },
  companyDocs: [{ file: null, documentType: "Company PAN" }],
  signatoryDocs: [{ file: null, documentType: "PAN" }]
};

export const CustomerProvider = ({ children }) => {
  const { getDashboardData, profileData } = useAuth();
  const [disconnectionTog, setDisconnectionTog] = useState(false);
  const [customerInformation, setCustomerImformation] = useState();
  const [customerlist, setCustomerList] = useState();
  const [filteredData, setFilteredData] =
    useState();

  const [newCustommer, setNewCustomer] = useState(newCustomeInit);


  const createCustomer = useCallback(async (e) => {
    return await handleRequest(
      () => customerService.createCustomer(e),
      "Registered",
      () => getDashboardData()
    );
  }, [getDashboardData]);

  const disconnection = useCallback(async (id, e) => {
    return await handleRequest(
      () => customerService.disconnection(id, e),
      "Disconnection Raised",
      () => getDashboardData()
    );
  }, [getDashboardData]);

    const extension = useCallback(async (id, e) => {
    return await handleRequest(
      () => customerService.extension(id, e),
      "Extension Successful",
      () => getDashboardData()
    );
  }, [getDashboardData]);

  const retention = useCallback(async (id) => {
    const tid = toast.loading("loading...");
    try {
      await customerService.retention(id);
      toast.success("Done", { id: tid });
      getDashboardData()

    } catch (err) {
      toast.error("Server error", { id: tid });
    }
  }, []);

  const redisconnection = async (id, e) => {
    try {
      toast.loading("loading...");
      const data = await customerService.redisconnection(id, e);
      toast.dismiss();
      toast.success("Done")
      getDashboardData()

    } catch (err) {
      toast.dismiss();
      toast.error("Server error");
    }
  };

  const transfer = async (id, e) => {
    try {
      toast.loading("loading...");
      const data = await customerService.transfer(id, e);
      toast.dismiss();
      toast.success("Done")
      getDashboardData()

    } catch (err) {
      toast.dismiss();
      toast.error("Server error");
    }
  };
  const getCustomer = async () => {
    try {
      toast.loading("loading...");
      const data = await customerService.getCustomer();
      toast.dismiss()
      getDashboardData()

    } catch (err) {
      toast.dismiss();
      toast.error("Server error");
    }
  };

  const getCustomerById = useCallback(async (id) => {
    try {
      const data = await customerService.getCustomerById(id);
      setCustomerImformation(data?.customer)
      getDashboardData()

    } catch (err) {
      toast.error("Server error");
    }
  }, []);

  const editCustomer = useCallback(async (id, payload) => {
    const tid = toast.loading("Updating customer...");
    try {
      await customerService.editCustomer(id, payload);
      toast.success("Customer updated successfully", { id: tid });
      getDashboardData(); // Refresh global data
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update customer", { id: tid });
      throw err; // throw so the UI can keep the modal open if it fails
    }
  }, [getDashboardData]);

  const deleteCustomer = useCallback(async (id) => {
    const tid = toast.loading("Deleting customer...");
    try {
      await customerService.deleteCustomer(id);
      toast.success("Customer deleted successfully", { id: tid });
      getDashboardData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete customer", { id: tid });
      throw err;
    }
  }, [getDashboardData]);

  const getAllCustomer = useCallback(async () => {
    try {
      if (profileData?.role === "admin") {
        const data = await customerService.getAllCustomers();
        setCustomerList(data || []);
        // REMOVED getDashboardData() to break the infinite loop
      }
    } catch (err) {
      console.error("Fetch customers error:", err);
    }
  }, [profileData?.role]);

    const addBillingProfile = useCallback(
      async (customerId, payload) => {
        return await handleRequest(
          () => customerService.addBillingProfile(customerId, payload),
          "Billing Profile Added Successfully",
          () => getDashboardData(),
        );
      },
      [getDashboardData],
    );
  
    const editBillingProfile = useCallback(
      async (customerId, profileId, payload) => {
        return await handleRequest(
          () => customerService.editBillingProfile(customerId, profileId, payload),
          "Billing Profile Updated Successfully",
          () => getDashboardData(),
        );
      },
      [getDashboardData],
    );
  
    const removeBillingProfile = useCallback(
      async (customerId, profileId) => {
        return await handleRequest(
          () => customerService.removeBillingProfile(customerId, profileId),
          "Billing Profile Removed Successfully",
          () => getDashboardData(),
        );
      },
      [getDashboardData],
    );



  useEffect(() => {
    if (profileData?.role === "admin") {
      getAllCustomer();
    }
  }, [profileData?.role, getAllCustomer]);

  const value = useMemo(
    () => ({
      disconnection,
      extension,
      retention,
      transfer,
      getCustomerById,
      disconnectionTog,
      setDisconnectionTog,
      customerInformation,
      setCustomerImformation,
      redisconnection,
      filteredData,
      setFilteredData,
      customerlist,
      setCustomerList,
      getAllCustomer,
      createCustomer,
      newCustommer,
      setNewCustomer,
      newCustomeInit,
      editCustomer,
      deleteCustomer,
      addBillingProfile,
      editBillingProfile,
      removeBillingProfile,
    }),
    [
      extension,
      getCustomerById,
      disconnectionTog,
      customerInformation,
      filteredData,
      customerlist,
      getAllCustomer,
      createCustomer,
      newCustommer,
      editCustomer,
      deleteCustomer,
      addBillingProfile,
      editBillingProfile,
      removeBillingProfile,
    ],
  );
  return <CustomerApi.Provider value={value}>{children}</CustomerApi.Provider>;
};

export const useCustomer = () => use(CustomerApi);

