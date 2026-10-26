import React, {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
} from "react";
import toast from "react-hot-toast";
import { ConnectionService } from "../Services/connectionService";
import { useCustomer } from "./CustomerContext";
import { useAuth } from "./AuthContext";
import { handleRequest } from "../Services/handleRequest";

const ConnectionAPI = createContext();

export const ConnectionProvider = ({ children }) => {
  const [connectionData, setConnectionData] = useState([]);
  const [singleConnectionData, setSingleConnectionData] = useState();
  const { setFilteredData } = useCustomer();
  const { getDashboardData } = useAuth();

  // --- GETTERS ---

  const getConnection = useCallback(async (id, e) => {
    try {
      const { connections } = await ConnectionService.getConnection(id);
      setConnectionData(connections);
    } catch (err) {
      toast.error("Server error");
    }
  }, []);

    const projectReportData = useCallback(async () => {
    try {
      const data = await ConnectionService.projectReport();
      return data
    } catch (err) {
      toast.error("Server error");
    }
  }, []);

  const getConnectionById = useCallback(async (id) => {
    return await handleRequest(
      () => ConnectionService.getConnectionById(id),
      "Connection loaded",
      (data) => setSingleConnectionData(data.connection),
    );
  }, []);

  // --- ACTIONS (MUTATIONS) ---

  const createConnection = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.createConnection(id, e),
        "Registered Successfully",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const cancel = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.cancel(id, e),
        "Canceled Successfully",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const Delete = useCallback(
    async (id) => {
      return await handleRequest(
        () => ConnectionService.delete(id),
        "Canceled Successfully",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const putConnection = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.putConnection(id, e),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const patchConnection = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.patchConnection(id, e),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const updateTelcoCircuitId = useCallback(
    async (id, payload) => {
      return await handleRequest(
        () => ConnectionService.updateTelcoCircuitId(id, payload),
        "Telco Circuit ID updated",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const updateTopology = useCallback(
    async (id, payload) => {
      return await handleRequest(
        () => ConnectionService.updateTopology(id, payload),
        "Network topology updated",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const uploadSignedRmacd = useCallback(
    async (id, payload) => {
      return await handleRequest(
        () => ConnectionService.uploadSignedRmacd(id, payload),
        "Signed RMACD uploaded",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const uploadSignedDocuments = useCallback(
    async (id, payload) => {
      return await handleRequest(
        () => ConnectionService.uploadSignedDocuments(id, payload),
        "Signed documents uploaded",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const approveConnection = useCallback(
    async (id) => {
      return await handleRequest(
        () => ConnectionService.approveConnection(id),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const activeConnection = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.activeConnection(id, e),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const Reject = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.reject(id, e),
        "Reject Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const Generate = useCallback(
    async (id) => {
      const tid = toast.loading("Processing...");
      try {
        const response = await ConnectionService.generate(id);
        toast.success("Generate Successful", { id: tid });
        getDashboardData();
        return response;
      } catch (error) {
        if (error.response && error.response.data instanceof Blob) {
          const errorText = await error.response.data.text();
          const errorJson = JSON.parse(errorText);
          toast.error(errorJson.message || "Failed to generate", { id: tid });
        } else {
          toast.error(error?.response?.data?.message || "Failed to generate", { id: tid });
        }
        throw error;
      }
    },
    [getDashboardData],
  );

  const addIp = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.addIp(id, e),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );
  const EditRemark = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.EditRemark(id, e),
        "Update Successful",
      );
    },
    [],
  );

   const CostProvider = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.CostProvider(id, e),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const updateConnection = useCallback(
    async (id, e) => {
      return await handleRequest(
        () => ConnectionService.update(id, e),
        "Update Successful",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );


  // 1. Template Download Logic
  const downloadBulkTemplate = useCallback(async () => {
    const tid = toast.loading("Downloading template...");
    try {
      const blob = await ConnectionService.downloadBulkTemplate();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "crm-bulk-connection-template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Template Downloaded!", { id: tid });
    } catch (err) {
      toast.error("Download failed!", { id: tid });
    }
  }, []);

  // 2. Preview Excel (Validation)
  const previewBulkUpload = useCallback(async (formData) => {
    return await handleRequest(
      () => ConnectionService.previewBulkUpload(formData),
      "Validation Complete!",
    );
  }, []);

  // 3. Final Creation (DB Save)
  const createBulkConnections = useCallback(
    async (customerId, formData) => {
      return await handleRequest(
        () => ConnectionService.createBulkConnections(customerId, formData),
        "Connections Created Successfully!",
        () => getDashboardData(), // Refresh dashboard after success
      );
    },
    [getDashboardData],
  );

  // 4. Bulk batches: one unsigned PO / CAF per upload, signed copies uploaded once for all its connections
  const getBulkBatches = useCallback(async (customerId) => {
    try {
      const { batches } = await ConnectionService.getBulkBatches(customerId);
      return batches || [];
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load bulk orders");
      return [];
    }
  }, []);

  const uploadBulkSignedDocuments = useCallback(
    async (batchId, formData) => {
      return await handleRequest(
        () => ConnectionService.uploadBulkSignedDocuments(batchId, formData),
        "Signed documents uploaded",
        () => getDashboardData(),
      );
    },
    [getDashboardData],
  );

  const value = useMemo(
    () => ({
      createConnection,
      getConnection,
      connectionData,
      setConnectionData,
      Generate,
      putConnection,
      patchConnection,
      getConnectionById,
      singleConnectionData,
      setSingleConnectionData,
      approveConnection,
      uploadSignedDocuments,
      uploadSignedRmacd,
      updateTopology,
      updateTelcoCircuitId,
      activeConnection,
      Delete,
      Reject,
      addIp,
      cancel,
      updateConnection,
      downloadBulkTemplate,
      previewBulkUpload,
      createBulkConnections,
      getBulkBatches,
      uploadBulkSignedDocuments,
      EditRemark,
      CostProvider,
      projectReportData,
    }),
    [
      createConnection,
      getConnection,
      connectionData,
      Generate,
      putConnection,
      patchConnection,
      getConnectionById,
      singleConnectionData,
      approveConnection,
      uploadSignedDocuments,
      uploadSignedRmacd,
      updateTopology,
      updateTelcoCircuitId,
      activeConnection,
      addIp,
      Reject,
      cancel,
      updateConnection,
      Delete,
      downloadBulkTemplate,
      previewBulkUpload,
      createBulkConnections,
      getBulkBatches,
      uploadBulkSignedDocuments,
      EditRemark,
      CostProvider,
      projectReportData,
    ],
  );

  return (
    <ConnectionAPI.Provider value={value}>{children}</ConnectionAPI.Provider>
  );
};

export const useConnection = () => {
   const context = use(ConnectionAPI);
  if (!context) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
};
