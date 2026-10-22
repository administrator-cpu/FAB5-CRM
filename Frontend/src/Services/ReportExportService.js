import * as XLSX from 'xlsx';

export const generateRoleBasedReport = (customers, connections, userRole) => {
  const isAdmin = userRole === 'admin';
  const isProjectManager = userRole === 'project_manager';
  const isEmployee = userRole === 'employee';

  const wb = XLSX.utils.book_new();

  // 1. FORMAT CUSTOMER DATA (Admin & Employee Only)
  if (isAdmin || isEmployee) {
    const customerSheetData = customers.map((c) => {
      const profiles = c.billingProfiles || c.billingProfile || [];
      let customerRow = {
        "Customer Name": c.name || "N/A",
        "Name": c.person || "N/A",
        "Mobile": c.mobile || "N/A",
        "Email": c.email || "N/A",
      };

      if (profiles.length === 0) {
        customerRow["GST 1"] = "N/A";
      } else {
        profiles.forEach((profile, index) => {
          customerRow[`GST ${index + 1}`] = profile.gstNumber || "N/A";
        });
      }
      return customerRow;
    });

    const wsCustomers = XLSX.utils.json_to_sheet(customerSheetData);
    wsCustomers['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsCustomers, "Customer");
  }

  // 2. FORMAT INVENTORY DATA (Role-Based Columns)
  const inventorySheetData = connections.map((conn) => {
    let row = {};

    row["Customer Name"] = conn.customer?.name || conn?.customerName || "N/A";

    if (isAdmin || isProjectManager) {
      row["Sales Manager"] = conn.createdBy?.name || conn?.salesManager || "N/A";
      row["Airtel LSI"] = conn.telecoCircuitId || "N/A";
    }

    row["FAB Circuit ID"] = conn.fabCircuitId || conn.opportunityId || "N/A";
    row["Status"] = conn.status || "N/A";
    row["Service Type"] = conn.serviceType || "N/A";

    if (isAdmin || isProjectManager) {

      const bandwidthChanges = conn.history?.filter(h => h.action === 'UPGRADE' || h.action === 'DOWNGRADE');
      const lastChange = bandwidthChanges?.[bandwidthChanges.length - 1];
      
      const note = typeof lastChange?.note === 'string' ? lastChange.note : '';
      const oldBw = note ? Number(note.split('→')[0].replace(/[^0-9]/g, '').trim()) : NaN;
      row["Old Bandwidth"] = Number.isFinite(oldBw) && oldBw > 0 ? oldBw : null;
    }

    row["Bandwidth (Mbps)"] = Number(conn.bandwidth) || 0;

    if (isAdmin || isEmployee) {
      row["MRC"] = Number(conn.commercials?.mrc) || 0;
      row["Rate per MB"] = Number(conn.commercials?.ratePerMb) || 0;
      row["OTC"] = Number(conn.commercials?.otc) || 0;
    }

    if (isAdmin) {
      row["Airtel Rate"] = Number(conn.providerCost?.mrc) || 0;
    }

    row["Provider"] = conn.technicalDetails?.telcoProvider || conn?.provider || "N/A";
    
    // FIX: Pass actual Date objects. Use `null` instead of "N/A" so Excel keeps the column type strictly as 'Date'
    row["Acceptance Date"] = conn.acceptanceDate ? new Date(conn.acceptanceDate) : null;
    row["Created At"] = conn.createdAt ? new Date(conn.createdAt) : null;
    row["Termination Raise Date"] = conn.terminationDetails?.raiseDate ? new Date(conn.terminationDetails.raiseDate) : null;
    row["Final Termination Date"] = conn.terminationDetails?.finalDate ? new Date(conn.terminationDetails.finalDate) : null;
    
    row["Termination Reason"] = conn.terminationDetails?.reason || "N/A";
    row["A BTS ID"] = conn.technicalDetails?.aEnd?.btsId || "N/A";
    row["B BTS ID"] = conn.technicalDetails?.bEnd?.btsId || "N/A";

    return row;
  });

  const wsInventory = XLSX.utils.json_to_sheet(inventorySheetData, { cellDates: true });
  wsInventory['!autofilter'] = { ref: wsInventory['!ref'] };
  wsInventory['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  
  XLSX.utils.book_append_sheet(wb, wsInventory, "Inventory");

  // 3. TRIGGER DOWNLOAD
  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `FAB5_Report_${userRole.toUpperCase()}_${timestamp}.xlsx`);
};