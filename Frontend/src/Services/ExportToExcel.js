import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// Helper to ensure numbers are strictly numbers for Excel formulas
const safeNumber = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const parsed = Number(val);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper to extract numbers from strings like "100 Mbps" or "1.5 Gbps"
const extractBandwidthNumber = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = String(val).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

export const exportConnectionsToExcel = (connections, customerName = "Customer") => {
  // 1. Flatten the data and STRICTLY CAST numbers
  const dataToExport = connections.map(conn => ({
    "Opportunity ID": conn.opportunityId || 'N/A',
    "Status": conn.status || 'N/A',
    "Service Type": conn.serviceType || 'N/A',
    
    // Explicitly parse to Number so Excel recognizes it as a digit
    "Bandwidth (Mbps)": extractBandwidthNumber(conn.bandwidth),

    // Technical Details
    "A-End BTS ID": conn.technicalDetails?.aEnd?.btsId || 'N/A',
    "A-End Address": conn.technicalDetails?.aEnd?.address || 'N/A',
    "B-End BTS ID": conn.technicalDetails?.bEnd?.btsId || 'N/A',
    "B-End Address": conn.technicalDetails?.bEnd?.address || 'N/A',
    "Provider": conn.technicalDetails?.telcoProvider || 'N/A',

    // Flattening Commercials - Strict Number Casting
    "MRC": safeNumber(conn.commercials?.mrc),
    "Rate per MB": safeNumber(conn.commercials?.ratePerMb),
    "OTC": safeNumber(conn.commercials?.otc),
    "IP Count": safeNumber(conn.ips?.count),
    "Per IP Cost": safeNumber(conn.ips?.perIpCost || (conn.ips?.count ? (conn.ips?.cost || 0) / conn.ips.count : 0)),
    "Total IP Cost": safeNumber(conn.ips?.cost),
    
    // Dates (Formatted for readability)
    "Acceptance Date": conn.acceptanceDate ? new Date(conn.acceptanceDate).toLocaleDateString() : 'N/A',
    "Created At": conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : 'N/A',
    
    // Termination Info (if applicable)
    "Termination Raise Date": conn.terminationDetails?.raiseDate ? new Date(conn.terminationDetails.raiseDate).toLocaleDateString() : 'N/A',
    "Final Termination Date": conn.terminationDetails?.finalDate ? new Date(conn.terminationDetails.finalDate).toLocaleDateString() : 'N/A',
    "Termination Reason": conn.terminationDetails?.reason || 'N/A'
  }));

  // 2. Create the Excel Workbook
  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  
  // Optional: Set column widths so data isn't cramped
  const wscols = [
    {wch: 18}, {wch: 12}, {wch: 12}, {wch: 15}, // Basics
    {wch: 15}, {wch: 35}, {wch: 15}, {wch: 35}, {wch: 15}, // Tech Details
    {wch: 12}, {wch: 12}, {wch: 12}, {wch: 10}, {wch: 12}, // Commercials
    {wch: 15}, {wch: 15}, // Dates
    {wch: 20}, {wch: 20}, {wch: 25} // Termination Details
  ];
  worksheet['!cols'] = wscols;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Connections");

  // 3. Download
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  saveAs(dataBlob, `${customerName.replace(/[^a-zA-Z0-9]/g, '_')}_Connection_Report.xlsx`);
};