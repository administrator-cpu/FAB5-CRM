// Static text for the auto-generated customer Purchase Order (PO), from "Demo/PO -FAB5.docx".
// The terms are fixed wording — order values (MRC, OTC, capacity…) only appear in the tables.

const TITLE = "PURCHASE ORDER";

// Addressee block ("To,") — FAB5's address as written on the PO.
const ADDRESSEE = {
  salutation: "To,",
  name: "FAB FIVE NETWORK PRIVATE LIMITED",
  lines: ["Plot No. 2456, AKH no. 82/16", "Jain Colony, Delhi -110081"],
};

const CUSTOMER_LABELS = {
  name: "Company/Firm Name",
  billingAddress: "Billing Address",
  gst: "GSTN (if Any)",
  person: "Contact Person Name",
  contact: "Contact No & Email ID",
};

const COMMERCIAL_HEADING = "Commercial Details for Bandwidth Order";

const SITE_TABLE = {
  columns: ["", "A_End", "B_End"],
  btsLabel: "BTS/PoP",
  addressLabel: "Installation Address (with Pin Code)",
};

const CHARGES_COLUMNS = [
  "Product / Link Type",
  "Capacity In Mbps",
  "Monthly Recurring Charges (18% GST Extra)",
  "One Time Charges (18% GST Extra)",
];

const TECHNICAL = {
  heading: "A) Technical Part:",
  slaLabel: "Service Level Agreement:",
  slaValue: "Yes",
  staticIpLabel: "No. of Static IP required:",
  note: "NOTE: /29 IP Pool (Five Nos of Usable Ips) Available @ Rs. 1000 + 18% GST, You can Take After Link Delivery as Per Required.",
};

// Payment terms, exit clause and closing notes. Block types: heading | para { runs:[{text,bold}] }.
const TERMS_BLOCKS = [
  { type: "heading", text: "B) Payment Terms & Conditions:" },
  { type: "para", runs: [{ text: "Payment Terms: ", bold: true }, { text: "Monthly Basis against Prepaid Invoice Received Due Date 7th of Day of Each Month.", bold: false }] },
  { type: "para", runs: [{ text: "One Time Charge: ", bold: true }, { text: "One-time charges (OTC) shall be payable at the time of order placement. Rs. 5000/- (Rupees Five Thousand Only)", bold: false }] },
  { type: "para", runs: [{ text: "Recurring Charges: Recurring charges shall be payable as follows:", bold: true }] },
  { type: "para", runs: [{ text: "Bandwidth Charges: Bandwidth Charges along with CPE rental will be paid.", bold: false }] },
  { type: "para", runs: [{ text: "Monthly/Quarterly ", bold: true }, { text: "in advance on pro- rata basis immediately after installation. Invoice for recurring charges shall be raised as and when individual links are commissioned.", bold: false }] },
  { type: "para", runs: [{ text: "Tenure of the Contract: ", bold: true }, { text: "Shall be for 1 year and auto renewed every year after the expiry of the initial contract period, unti the customer informed specifically to end the agreement.", bold: false }] },
  { type: "para", runs: [{ text: "We shall make the payment on or before the due date. Late payment fee @ 2.50 % per month shall apply if the payment is not made by the due date.", bold: false }] },
  { type: "para", runs: [{ text: "Payment to be made In favor of Fab Five Network Pvt Ltd.", bold: true }] },
  { type: "para", runs: [{ text: "Remarks: Service Provider shall have the option to provision the services or execute the project through any of its affiliates, subsidiaries and shall be liable for the performance of their respective obligations in respect of the Services/Project.", bold: false }] },
  { type: "para", runs: [{ text: "Taxes: ", bold: true }, { text: "The SO is exclusive of Service tax, sales tax and any current and future turnover related or any other taxes / duties applicable in India which shall be charged at actual to the Customers.", bold: false }] },
  { type: "para", runs: [{ text: "Remarks: The present applicable service tax rate (GST) is 18%", bold: true }] },

  { type: "heading", text: "Exit Clause for Services and Hardware:" },
  { type: "para", runs: [{ text: "Remarks", bold: true }, { text: ": The network services have been envisaged for 1 year of contract period. Therefore, in case of early exit we will have to pay the charges as mentioned below: If we choose to;", bold: false }] },
  { type: "para", runs: [{ text: "Exit after signing the CAF ", bold: true }, { text: "but prior to Service Activation Date, then we shall pay Service Provider an amount equal to 3 months rental Charges and the installation Charges for the Service.", bold: false }] },
  { type: "para", runs: [{ text: "Exit after the Service Activation Date, but prior to expiry of the Service Contract Period", bold: true }, { text: ": The tenure of the contract is for (1) years; however, if we opt for early exit then the same can be done by giving one-month notice subject to Pre-Termination Charges mention below.", bold: false }] },
  { type: "para", runs: [{ text: "Pre-Termination", bold: true }, { text: ": Pre-Termination charges shall be applicable as below [Unexpired Duration of the Contract (in months) * MRC]", bold: false }] },
  { type: "para", runs: [{ text: "Shifting of Charges: ", bold: true }, { text: "Shifting Charges per link shall be on actual. The shifting shall be carried out subject to technical feasibility and commercial viability", bold: false }] },
  { type: "para", runs: [{ text: "Delivery", bold: true }, { text: ": Delivery of the services shall be within 4 - 6 weeks. (While No Challenges shared by Telco)", bold: false }] },
  { type: "para", runs: [{ text: "This PO is subject to T & C's of CAF, PTC's and GTC's in that order.", bold: false }] },
  { type: "para", runs: [{ text: "Note_ for DIA link BTS address fill in * Column.", bold: false }] },
];

const SIGNATURE_TEXT = "Authorized Signatory";

module.exports = {
  TITLE,
  ADDRESSEE,
  CUSTOMER_LABELS,
  COMMERCIAL_HEADING,
  SITE_TABLE,
  CHARGES_COLUMNS,
  TECHNICAL,
  TERMS_BLOCKS,
  SIGNATURE_TEXT,
};
