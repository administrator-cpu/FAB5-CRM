import React from "react";

function CustomerDocumentsSection({ documents, userRole }) {
  if (!(userRole === "admin" || userRole === "owner") || !documents) return null;

  const renderDocRow = (doc, idx) => (
    <div key={doc._id || doc.fileName || idx} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg">
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="text-2xl">📄</span>
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-semibold text-gray-800 truncate" title={doc.fileName}>{doc.fileName}</span>
          <span className="text-xs text-gray-500">{doc.documentType}</span>
        </div>
      </div>
      <a 
        href={doc.url}
        target="_blank" 
        rel="noopener noreferrer"
        className="ml-4 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors whitespace-nowrap"
      >
        View PDF
      </a>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">KYC Documents</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Company Documents Column */}
        {documents.companyDocuments?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider border-b pb-2">Company Documents</h3>
            <div className="flex flex-col gap-3">
              {documents.companyDocuments.map(renderDocRow)}
            </div>
          </div>
        )}

        {/* Signatory Documents Column */}
        {documents.signatoryDocuments?.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider border-b pb-2">Signatory Documents</h3>
            <div className="flex flex-col gap-3">
              {documents.signatoryDocuments.map(renderDocRow)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerDocumentsSection;