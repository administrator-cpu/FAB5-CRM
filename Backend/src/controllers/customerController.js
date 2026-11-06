const exceljs = require("exceljs");
const Customer = require("../models/customerModel");
const Connection = require("../models/connectionModel");
const User = require("../models/userModel");
const { uploadDocument } = require("../services/upload.service");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const ROLES = require("../constants/roles");
const { standardizeState } = require("../constants/states");
const { sendTransactionEmail } = require("../services/sendEmail");
const { canAccessCustomer } = require("../utils/access");
const { escapeRegex } = require("../utils/security");

// Loads a customer for a billing-profile change, refusing employees who don't manage it.
const findManagedCustomer = async (req, next, customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    next(new AppError("Customer not found", 404));
    return null;
  }
  if (!canAccessCustomer(req.user, customer)) {
    next(new AppError("You can only change your own customers", 403));
    return null;
  }
  return customer;
};

// Longest single notice-period extension (the app offers 30 days; one spare day covers time zones).
const MAX_EXTENSION_DAYS = 31;

const buildHistorySnapshot = (connection) => ({
  serviceType: connection.serviceType,
  bandwidth: connection.bandwidth,
  technicalDetails: connection.technicalDetails,
  commercials: connection.commercials,
  ips: connection.ips,
  terminationDetails: connection.terminationDetails || {},
});

const createCustomer = asyncHandler(async (req, res, next) => {
  let { customerType, name, email, mobile, person, billingProfiles } = req.body;
  if (billingProfiles && Array.isArray(billingProfiles)) {
    billingProfiles = billingProfiles.map(profile => {
      if (profile.address && profile.address.state) {
        profile.address.state = standardizeState(profile.address.state);
      }
      return profile;
    });
  }
  if (typeof billingProfiles === 'string') {
    billingProfiles = JSON.parse(billingProfiles);
  }

  if (!name || !email || !mobile || !person) {
    return next(new AppError("name, email, mobile and person are required", 400));
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError("Please enter a valid email", 400));
  }

  const mobileRegex = /^[6-9]\d{9}$/;
  if (!mobileRegex.test(mobile)) {
    return next(new AppError("Please enter a valid 10-digit Indian mobile number", 400));
  }

  const existCustomer = await Customer.findOne({
    email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") }
  });
  if (existCustomer) {
    return next(new AppError("Customer with this email already exists", 400));
  }

  const companyFiles = req.files?.companyDocuments || [];
  const signatoryFiles = req.files?.signatoryDocuments || [];
  if (!companyFiles.length) {
    return next(new AppError("At least one compnay document is required", 400));
  }
  if (!signatoryFiles.length) {
    return next(new AppError("At least one signatory document is required", 400));
  }

  const compDocTypes = Array.isArray(req.body.companyDocumentsType)
    ? req.body.companyDocumentsType
    : [req.body.companyDocumentsType];

  const sigDocTypes = Array.isArray(req.body.signatoryDocumentsType)
    ? req.body.signatoryDocumentsType
    : [req.body.signatoryDocumentsType];

  if (customerType === "ISP" && !compDocTypes.includes("ISP License")) {
    return next(new AppError("An ISP License is strictly required to create an ISP customers", 400));
  }

  const companyDocuments = []
  for (let i = 0; i < companyFiles.length; i++) {
    const file = companyFiles[i];
    const uploaded = await uploadDocument(file, "crm/customers/company");

    companyDocuments.push({
      documentType: compDocTypes[i] || "Company PAN",
      fileName: file.originalname,
      url: uploaded.url,
      publicId: uploaded.publicId,
      storage: uploaded.storage
    });
  }

  const signatoryDocuments = []
  for (let i = 0; i < signatoryFiles.length; i++) {
    const file = signatoryFiles[i];
    const uploaded = await uploadDocument(file, "crm/customers/signatory");

    signatoryDocuments.push({
      documentType: sigDocTypes[i] || "PAN",
      fileName: file.originalname,
      url: uploaded.url,
      publicId: uploaded.publicId,
      storage: uploaded.storage
    });
  }

  const customer = await Customer.create({
    name,
    person,
    email,
    mobile,
    managedBy: req.user._id,
    customerType: customerType || "Enterprise",
    billingProfile: billingProfiles || [],
    isActive: true,
    documents: {
      companyDocuments,
      signatoryDocuments,
    },
  });

  logger.info("Customer Created", {
    customerId: customer._id,
    name: customer.name,
    createdBy: req.user._id,
  })

  res.status(201).json({
    success: true,
    message: "Customer created successfully",
    customer,
  });
});

const editCustomer = asyncHandler(async (req, res, next) => {
  const customerId = req.params.id;

  const customer = await Customer.findById(customerId);
  if (!customer) {
    return next(new AppError("No customer found with that ID", 404));
  }
  if (!canAccessCustomer(req.user, customer)) {
    return next(new AppError("You can only edit your own customers", 403));
  }

  // Only admins can reassign a customer or change whether it is active.
  const updatableFields = req.user.role === ROLES.ADMIN
    ? ['name', 'person', 'email', 'mobile', 'customerType', 'managedBy', 'isActive']
    : ['name', 'person', 'email', 'mobile', 'customerType'];
  updatableFields.forEach(field => {
    if (req.body[field] !== undefined) {
      customer[field] = req.body[field];
    }
  });
  if (req.body.billingProfiles && Array.isArray(req.body.billingProfiles)) {
    req.body.billingProfiles = req.body.billingProfiles.map(profile => {
      if (profile.address && profile.address.state) {
        profile.address.state = standardizeState(profile.address.state);
      }
      return profile;
    });
  }
  if (req.body.billingProfiles) {
    customer.billingProfile = typeof req.body.billingProfiles === 'string'
      ? JSON.parse(req.body.billingProfiles)
      : req.body.billingProfiles;
  }

  const companyFiles = req.files?.companyDocuments || [];
  if (companyFiles.length > 0) {
    const compDocTypes = Array.isArray(req.body.companyDocumentsType)
      ? req.body.companyDocumentsType
      : [req.body.companyDocumentsType];

    for (let i = 0; i < companyFiles.length; i++) {
      const file = companyFiles[i];
      const uploaded = await uploadDocument(file, "crm/customers/company");

      customer.documents.companyDocuments.push({
        documentType: compDocTypes[i] || "Company PAN",
        fileName: file.originalname,
        url: uploaded.url,
        publicId: uploaded.publicId,
        storage: uploaded.storage
      });
    }
  }

  const signatoryFiles = req.files?.signatoryDocuments || [];
  if (signatoryFiles.length > 0) {
    const sigDocTypes = Array.isArray(req.body.signatoryDocumentsType)
      ? req.body.signatoryDocumentsType
      : [req.body.signatoryDocumentsType];

    for (let i = 0; i < signatoryFiles.length; i++) {
      const file = signatoryFiles[i];
      const uploaded = await uploadDocument(file, "crm/customers/signatory");

      customer.documents.signatoryDocuments.push({
        documentType: sigDocTypes[i] || "PAN",
        fileName: file.originalname,
        url: uploaded.url,
        publicId: uploaded.publicId,
        storage: uploaded.storage
      });
    }
  }

  await customer.save();
  const updatedCustomer = await Customer.findById(customerId).populate("managedBy", "name email");

  res.status(200).json({
    status: "success",
    message: "Customer updated successfully",
    data: {
      customer: updatedCustomer,
    },
  });
});

const deleteCustomer = asyncHandler(async (req, res, next) => {
  const customerId = req.params.id;

  const customer = await Customer.findById(customerId);

  if (!customer) {
    return next(new AppError("No customer found with that ID", 404));
  }
  if (!canAccessCustomer(req.user, customer)) {
    return next(new AppError("You can only delete your own customers", 403));
  }

  customer.isActive = false;
  await customer.save();

  await Connection.updateMany(
    { customer: customerId, status: { $nin: ["Deleted"] } },
    {
      $set: { status: "Deleted" },
      $push: {
        history: {
          action: "DELETED",
          note: "System auto-deleted due to customer deactivation",
          date: new Date(),
          performedBy: req.user._id
        }
      }
    }
  );

  res.status(200).json({
    status: "success",
    message: "Customer and associated connections have been successfully deactivated.",
  });
});

/* Bulk Customer Upload (For Developer Handling Only) */
const downloadCustomerTemplate = asyncHandler(async (req, res, next) => {
  const employees = await User.find({ role: "employee" }).select("email");
  const employeeEmails = employees.map((emp) => emp.email);

  const workbook = new exceljs.Workbook();

  const refSheet = workbook.addWorksheet("Reference Data", { state: "hidden" });

  // Dump the emails into Column A of the hidden sheet
  employeeEmails.forEach((email, index) => {
    refSheet.getCell(`A${index + 1}`).value = email;
  });

  const worksheet = workbook.addWorksheet("Bulk Upload Template");

  worksheet.columns = [
    { header: "Company Name*", key: "name", width: 25 },
    { header: "Contact Person*", key: "person", width: 20 },
    { header: "Email*", key: "email", width: 30 },
    { header: "Mobile*", key: "mobile", width: 15 },
    { header: "Customer Type*", key: "customerType", width: 20 },
    { header: "Manager Email*", key: "managerEmail", width: 30 },
    { header: "GST Number", key: "gst", width: 20 },
    { header: "Street*", key: "street", width: 30 },
    { header: "City*", key: "city", width: 15 },
    { header: "State*", key: "state", width: 15 },
    { header: "Pincode*", key: "pincode", width: 15 },
  ];

  worksheet.columns.forEach((column) => {
    column.protection = { locked: false };
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4A90E2" },
  };

  headerRow.eachCell((cell) => {
    cell.protection = { locked: true };
  });

  const emailDropdownFormula = employeeEmails.length > 0
    ? [`'Reference Data'!$A$1:$A$${employeeEmails.length}`]
    : ['"No Employees Found"'];

  for (let i = 2; i <= 1000; i++) {
    // Dropdown for Customer Type (Column E)
    worksheet.getCell(`E${i}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Enterprise,ISP,Operator,Government"'],
    };

    // Dropdown for Manager Email (Column F)
    worksheet.getCell(`F${i}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: emailDropdownFormula,
    };
  }

  await worksheet.protect("admin_secret_password", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
    insertRows: true,
    insertColumns: false,
    deleteRows: true,
    deleteColumns: false,
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=Bulk_Customer_Upload_Template.xlsx"
  );

  await workbook.xlsx.write(res);
  res.end();
});

const previewBulkCustomers = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Please upload an Excel file", 400));
  }

  const workbook = new exceljs.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const worksheet = workbook.getWorksheet("Bulk Upload Template");

  const validRecords = [];
  const invalidRecords = [];

  const existingCustomers = await Customer.find({}).select("email");
  const existingEmails = new Set(existingCustomers.map((c) => c.email.toLowerCase()));

  const allUsers = await User.find({}).select("email _id");
  const userMap = new Map(allUsers.map((u) => [u.email.toLowerCase(), u._id.toString()]));

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobileRegex = /^[6-9]\d{9}$/;
  const validCustomerTypes = ["Enterprise", "ISP", "Operator", "Government"];

  // Col 1: Name, Col 2: Person, Col 3: Email, Col 4: Mobile, Col 5: Type, Col 6: Manager Email,
  // Col 7: GST, Col 8: Street, Col 9: City, Col 10: State, Col 11: Pincode
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    // exceljs rows are 1-indexed, meaning row.getCell(1) is the first column
    const record = {
      rowNumber,
      name: row.getCell(1).text?.trim(),
      person: row.getCell(2).text?.trim(),
      email: row.getCell(3).text?.trim().toLowerCase(),
      mobile: row.getCell(4).text?.trim(),
      customerType: row.getCell(5).text?.trim(),
      managerEmail: row.getCell(6).text?.trim().toLowerCase(),
      gst: row.getCell(7).text?.trim(),
      street: row.getCell(8).text?.trim(),
      city: row.getCell(9).text?.trim(),
      state: row.getCell(10).text?.trim(),
      pincode: row.getCell(11).text?.trim(),
    };

    const errors = [];

    // Basic Validations
    if (!record.name) errors.push("Company Name is required");
    if (!record.person) errors.push("Contact Person is required");

    if (!record.email || !emailRegex.test(record.email)) {
      errors.push("Valid Email is required");
    } else if (existingEmails.has(record.email)) {
      errors.push("Customer Email already exists in DB");
    }

    if (!record.mobile || !mobileRegex.test(record.mobile)) {
      errors.push("Valid 10-digit Mobile is required");
    }

    if (!validCustomerTypes.includes(record.customerType)) {
      errors.push(`Invalid Customer Type. Must be one of: ${validCustomerTypes.join(", ")}`);
    }

    if (!record.street) errors.push("Street address is required");
    if (!record.city) errors.push("City is required");
    if (!record.state) errors.push("State is required");
    if (!record.pincode) errors.push("Pincode is required");

    // Manager Lookup
    let managerId = null;
    if (!record.managerEmail) {
      errors.push("Manager Email is required");
    } else if (!userMap.has(record.managerEmail)) {
      errors.push(`Manager with email ${record.managerEmail} not found in system`);
    } else {
      managerId = userMap.get(record.managerEmail);
    }

    // Format the payload exactly how the DB expects it
    const formattedData = {
      name: record.name,
      person: record.person,
      email: record.email,
      mobile: record.mobile,
      customerType: record.customerType,
      managedBy: managerId,
      isActive: true,
      billingProfile: [{
        label: "Default Billing",
        gstNumber: record.gst || undefined,
        address: {
          street: record.street || undefined,
          city: record.city || undefined,
          state: record.state || undefined,
          pincode: record.pincode || undefined,
        }
      }],
      documents: { companyDocuments: [], signatoryDocuments: [] } // Bypassing file uploads!
    };

    if (errors.length > 0) {
      invalidRecords.push({ row: rowNumber, data: record, errors });
    } else {
      // Temporarily mark as existing so duplicate emails IN the excel sheet flag an error
      existingEmails.add(record.email);
      validRecords.push(formattedData);
    }
  });

  res.status(200).json({
    success: true,
    message: `Found ${validRecords.length} valid records and ${invalidRecords.length} invalid records.`,
    data: {
      validRecords,
      invalidRecords
    }
  });
});

const commitBulkCustomers = asyncHandler(async (req, res, next) => {
  const { customers } = req.body; // This should be the 'validRecords' array from preview API

  if (!customers || !Array.isArray(customers) || customers.length === 0) {
    return next(new AppError("Please provide an array of valid customer objects", 400));
  }

  const insertedCustomers = await Customer.insertMany(customers, { ordered: false });

  res.status(201).json({
    success: true,
    message: `Successfully imported ${insertedCustomers.length} customers!`,
  });
});
/* End of Developer Handling APIs */

const getAllCustomers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const skip = (page - 1) * limit;

  const [customers, total] = await Promise.all([
    Customer.find({ isActive: true })
      .populate("managedBy", "name email role")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Customer.countDocuments(),
  ]);
  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    customers,
  });
});

const getCustomersById = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.params.id)
    .populate("managedBy", "name role email")
    .populate({
      path: "connections",
      select: "opportunityId serviceType bandwidth status createdAt",
      options: { sort: { createdAt: -1 } },
    })
  if (!customer) {
    return next(new AppError("Customer not found", 404));
  }
  if (!canAccessCustomer(req.user, customer)) {
    return next(new AppError("You can only view your own customers", 403));
  }

  res.status(200).json({
    success: true,
    customer,
  });
});

const getCustomersByEmp = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const skip = (page - 1) * limit;

  const [customers, total] = await Promise.all([
    Customer.find({ managedBy: req.user._id, isActive: true })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Customer.countDocuments({ managedBy: req.user._id }),

  ])

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    customers,
  });
});

const disconnection = asyncHandler(async (req, res, next) => {

  const { reason } = req.body;
  if (!reason) {
    return next(new AppError("Disconnection reason is required", 400));
  }

  const connection = await Connection.findById(req.params.id);
  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }
  if (req.user.role === ROLES.EMPLOYEE) {
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only disconnect your own customers", 403));
    }
  }
  if (connection.status !== "Active") {
    return next(new AppError(`Cannot disconnect a connection with status: ${connection.status}`, 400));
  }

  const today = new Date();
  const finalDate = new Date();
  finalDate.setDate(today.getDate() + 30);

  connection.terminationDetails = { reason, raiseDate: today, finalDate };
  connection.status = "Notice Period";
  connection.history.push({
    action: "DISCONNECT_INITIATED",
    performedBy: req.user._id,
    note: reason,
    ...buildHistorySnapshot(connection),
  });

  const savedConnection = await connection.save();

  logger.info("Disconnection initiated", {
    connectionId: connection._id,
    opportunityId: connection.opportunityId,
    by: req.user._id,
  });

  try {
    const populated = await Connection.findById(connection._id).populate("createdBy", "name email");
    await sendTransactionEmail("DISCONNECTION", populated, req.user);
  } catch (err) {
    logger.error("Failed to send disconnection email", {
      opportunityId: connection.opportunityId,
      error: err.message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Disconnection initiated successfully",
    connection: savedConnection,
  });

});

const extension = asyncHandler(async (req, res, next) => {

  const { newDate } = req.body;
  if (!newDate) {
    return next(new AppError("New extension date is required", 400));
  }

  const parsedNewDate = new Date(newDate);
  if (isNaN(parsedNewDate) || parsedNewDate <= new Date()) {
    return next(new AppError("Extension date must be a valid future date", 400));
  }

  const connection = await Connection.findById(req.params.id);
  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }
  if (connection.status !== "Notice Period") {
    return next(new AppError(`Can only extend connections in Notice Period`, 400));
  }

  // Each extension moves the disconnection date by at most MAX_EXTENSION_DAYS.
  const currentFinalDate = new Date(connection.terminationDetails?.finalDate);
  const extendFrom = Math.max(isNaN(currentFinalDate) ? 0 : currentFinalDate.getTime(), Date.now());
  if (parsedNewDate.getTime() > extendFrom + MAX_EXTENSION_DAYS * 24 * 60 * 60 * 1000) {
    return next(new AppError(`An extension can move the disconnection date by at most ${MAX_EXTENSION_DAYS} days`, 400));
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only extend your own customers", 403));
    }
  }

  let extensionCount = 0;
  for (let i = connection.history.length - 1; i >= 0; i--) {
    const action = connection.history[i].action;

    if (action === "EXTENDED") {
      extensionCount++;
    } else if (["DISCONNECT_INITIATED", "ACTIVATED", "RETAINED"].includes(action)) {
      break;
    }
  }

  if (extensionCount >= 2) {
    return next(new AppError("Client Policy: A connection can only be extended a maximum of 2 times during a notice period.", 403));
  }

  const previousDisconnectionDate = connection.terminationDetails?.finalDate;
  connection.terminationDetails.raiseDate = new Date();
  connection.terminationDetails.finalDate = parsedNewDate;
  connection.history.push({
    action: "EXTENDED",
    performedBy: req.user._id,
    note: `Extended to ${parsedNewDate.toISOString().split("T")[0]}`,
    ...buildHistorySnapshot(connection),
  });

  const savedConnection = await connection.save();

  logger.info("Connection extended", {
    connectionId: connection._id,
    opportunityId: connection.opportunityId,
    newDate: parsedNewDate,
    by: req.user._id,
  });

  try {
    const populated = await Connection.findById(connection._id).populate("createdBy", "name email");
    await sendTransactionEmail("EXTENSION", {
      opportunityId: populated.opportunityId,
      previousDisconnectionDate: previousDisconnectionDate
        ? previousDisconnectionDate.toISOString().split("T")[0]
        : "N/A",
      disconnectionDate: parsedNewDate.toISOString().split("T")[0],
      createdBy: populated.createdBy,
    }, req.user);
  } catch (error) {
    logger.error("Failed to send EXTENSION email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(200).json({
    success: true,
    message: `Extended successfully. (Extension ${extensionCount + 1} of 2 used)`,
    connection: savedConnection,
  });
});

const retention = asyncHandler(async (req, res, next) => {

  const connection = await Connection.findById(req.params.id);
  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }
  if (connection.status !== "Notice Period") {
    return next(new AppError(`Can only retain connections in Notice Period`, 400));
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only retain your own customers", 403));
    }
  }

  connection.terminationDetails = {
    raiseDate: null,
    finalDate: null,
    reason: null,
  };
  connection.status = "Active";
  connection.history.push({
    action: "RETAINED",
    performedBy: req.user._id,
    note: "Disconnection cancelled — connection retained",
    ...buildHistorySnapshot(connection),
  });

  const savedConnection = await connection.save();

  logger.info("Connection retained", {
    connectionId: connection._id,
    opportunityId: connection.opportunityId,
    by: req.user._id,
  });

  try {
    const populated = await Connection.findById(connection._id).populate("createdBy", "name email");
    await sendTransactionEmail("RETENTION", populated, req.user);
  } catch (err) {
    logger.error("Failed to send RETENTION email", {
      opportunityId: connection.opportunityId,
      error: err.message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Customer successfully retained! Disconnection cancelled.",
    connection: savedConnection,
  });
});

const addBillingProfile = asyncHandler(async (req, res, next) => {
  const { customerId } = req.params;
  const { label, gstNumber, address } = req.body;

  const customer = await findManagedCustomer(req, next, customerId);
  if (!customer) return;

  const newProfile = { label, gstNumber, address: address || {} };

  if (newProfile.address && newProfile.address.state) {
    newProfile.address.state = standardizeState(newProfile.address.state);
  }

  if (newProfile.address && newProfile.address.pincode) {
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(newProfile.address.pincode)) {
      return next(new AppError("Please enter a valid 6-digit pincode", 400));
    }
  }

  customer.billingProfile.push(newProfile);
  await customer.save();

  logger.info("Billing Profile Added", {
    customerId: customer._id,
    addedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Billing profile added successfully",
    billingProfile: customer.billingProfile,
  });
});

const editBillingProfile = asyncHandler(async (req, res, next) => {
  const { customerId, profileId } = req.params;
  const { label, gstNumber, address } = req.body;

  const customer = await findManagedCustomer(req, next, customerId);
  if (!customer) return;

  const profile = customer.billingProfile.id(profileId);
  if (!profile) {
    return next(new AppError("Billing profile not found", 404));
  }

  if (label !== undefined) profile.label = label;
  if (gstNumber !== undefined) profile.gstNumber = gstNumber;

  if (address) {
    if (address.street !== undefined) profile.address.street = address.street;
    if (address.city !== undefined) profile.address.city = address.city;
    if (address.pincode !== undefined) {
      const pincodeRegex = /^\d{6}$/;
      if (address.pincode && !pincodeRegex.test(address.pincode)) {
        return next(new AppError("Please enter a valid 6-digit pincode", 400));
      }
      profile.address.pincode = address.pincode;
    }
    if (address.state !== undefined) {
      profile.address.state = address.state ? standardizeState(address.state) : address.state;
    }
  }

  await customer.save();

  logger.info("Billing Profile Updated", {
    customerId: customer._id,
    profileId,
    updatedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Billing profile updated successfully",
    billingProfile: customer.billingProfile,
  });
});

const removeBillingProfile = asyncHandler(async (req, res, next) => {
  const { customerId, profileId } = req.params;

  const customer = await findManagedCustomer(req, next, customerId);
  if (!customer) return;

  const profile = customer.billingProfile.id(profileId);
  if (!profile) {
    return next(new AppError("Billing profile not found", 404));
  }

  profile.deleteOne();
  await customer.save();

  logger.info("Billing Profile Removed", {
    customerId: customer._id,
    profileId,
    removedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Billing profile removed successfully",
    billingProfile: customer.billingProfile,
  });
});

module.exports = {
  disconnection,
  getAllCustomers,
  getCustomersById,
  getCustomersByEmp,
  extension,
  retention,
  createCustomer,
  previewBulkCustomers,
  commitBulkCustomers,
  downloadCustomerTemplate,
  editCustomer,
  deleteCustomer,
  addBillingProfile,
  editBillingProfile,
  removeBillingProfile,

};
