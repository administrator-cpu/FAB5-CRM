import api from "./api";

export const ConnectionService = {
  createConnection: async (id, payload) => {
    const { data } = await api.post(`/connection/${id}`, payload, {
      withCredentials: true,
    });
    return data;
  },
  getConnection: async (id) => {
    const { data } = await api.get(`/connection/${id}`, {
      withCredentials: true,
    });
    return data;
  },
  update: async (id, e) => {
    const { data } = await api.patch(`/connection/${id}/edit-rejected`, e, {
      withCredentials: true,
    });
    return data;
  },
  cancel: async (id, e) => {
    const { data } = await api.patch(`/connection/${id}/cancel`, e, {
      withCredentials: true,
    });
    return data;
  },
  delete: async (id) => {
    const { data } = await api.patch(`/connection/${id}/delete`, {
      withCredentials: true,
    });
    return data;
  },
  approveConnection: async (id) => {
    const { data } = await api.patch(`/connection/${id}/approve`, {
      withCredentials: true,
    });
    return data;
  },
  EditRemark: async (id, e) => {
    const { data } = await api.patch(`/connection/${id}/remark`, e, {
      withCredentials: true,
    });
    return data;
  },
  CostProvider: async (id, e) => {
    const { data } = await api.put(`/connection/${id}/provider-cost`, e, {
      withCredentials: true,
    });
    return data;
  },
  activeConnection: async (id, e) => {
    const { data } = await api.patch(`/connection/${id}/activate`, e, {
      withCredentials: true,
    });
    return data;
  },
  reject: async (id, e) => {
    const { data } = await api.patch(`/connection/${id}/reject`, e, {
      withCredentials: true,
    });
    return data;
  },
  addIp: async (id, e) => {
    const { data } = await api.put(`/connection/${id}/add-ip`, e, {
      withCredentials: true,
    });
    return data;
  },
  generate: async (e) => {

    const payload = { connectionIds: e };
    const data = await api.post(`/connection/generate`, payload, {
      withCredentials: true,
      responseType: 'blob',
    });

    return data;
  },
  getConnectionById: async (id) => {
    const { data } = await api.get(`/connection/details/${id}`, {
      withCredentials: true,
    });

    return data;
  },
  projectReport: async () => {
    const { data } = await api.get(`/connection/project-report`, {
      withCredentials: true,
    });

    return data;
  },
  updateTelcoCircuitId: async (id, payload) => {
    const { data } = await api.patch(`/connection/${id}/telco-circuit-id`, payload, {
      withCredentials: true,
    });
    return data;
  },
  updateTopology: async (id, payload) => {
    const { data } = await api.patch(`/connection/${id}/topology`, payload, {
      withCredentials: true,
    });
    return data;
  },
  uploadSignedRmacd: async (id, payload) => {
    const { data } = await api.patch(`/connection/${id}/rmacd/signed`, payload, {
      withCredentials: true,
    });
    return data;
  },
  uploadSignedDocuments: async (id, payload) => {
    const { data } = await api.patch(`/connection/${id}/signed-documents`, payload, {
      withCredentials: true,
    });
    return data;
  },
  sendRmacdForEsign: async (id, payload) => {
    const { data } = await api.post(`/connection/${id}/rmacd/esign`, payload, {
      withCredentials: true,
    });
    return data;
  },
  sendBatchForEsign: async (batchId, payload) => {
    const { data } = await api.post(`/bulk-connections/batches/${batchId}/esign`, payload, {
      withCredentials: true,
    });
    return data;
  },
  sendForEsign: async (id, payload) => {
    const { data } = await api.post(`/connection/${id}/esign`, payload, {
      withCredentials: true,
    });
    return data;
  },
  putConnection: async (id, payload) => {
    const { data } = await api.put(`/connection/${id}/edit`, payload, {
      withCredentials: true,
    });
    return data;
  },
  patchConnection: async (id, payload) => {
    const { data } = await api.patch(`/connection/${id}/shift`, payload, {
      withCredentials: true,
    });
    return data;
  },
  downloadBulkTemplate: async () => {
    const response = await api.get(`/bulk-connections/download-template`, {
      responseType: 'blob',
      withCredentials: true,
    });
    return response.data;
  },
  previewBulkUpload: async (formData) => {
    const { data } = await api.post(`/bulk-connections/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      withCredentials: true,
    });
    return data;
  },
  createBulkConnections: async (customerId, formData) => {
    const { data } = await api.post(`/bulk-connections/${customerId}/create`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      withCredentials: true,
    });
    return data;
  },
  getBulkBatches: async (customerId) => {
    const { data } = await api.get(`/bulk-connections/${customerId}/batches`, {
      withCredentials: true,
    });
    return data;
  },
  uploadBulkSignedDocuments: async (batchId, formData) => {
    const { data } = await api.patch(`/bulk-connections/batches/${batchId}/signed-documents`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      withCredentials: true,
    });
    return data;
  },

};