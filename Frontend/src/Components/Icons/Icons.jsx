export const Edit = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`lucide lucide-pen-line ${className || ""}`}
  >
    <path d="M13 21h8" />
    <path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" />
  </svg>
);

export const Send = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`lucide lucide-send-horizontal-icon lucide-send-horizontal ${className}`}
  >
    <path d="M3.71 3.05a.5.5 0 0 0-.68.63l2.84 7.63a2 2 0 0 1 0 1.4l-2.84 7.63a.5.5 0 0 0 .68.63l18-8.5a.5.5 0 0 0 0-.9z" />
    <path d="M6 12h16" />
  </svg>
)

export const Connections = ({ className }) => (
  <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 20 20"
    className={className}
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="5" cy="10" r="2.7" />
    <circle cx="15" cy="10" r="2.7" />
    <path d="M7.7 10h4.6" />
  </svg>
);

export const Customers = ({ className }) => (
  <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 20 20"
    className={className}
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="10" cy="6.6" r="2.9" />
    <path d="M4.6 16.2c0-2.9 2.4-4.5 5.4-4.5s5.4 1.6 5.4 4.5" />
  </svg>
);

export const Team = ({ className }) => (
  <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 20 20"
    className={className}
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="7.2" cy="7.2" r="2.4" />
    <circle cx="14.3" cy="8.1" r="1.9" />
    <path d="M3.2 15.6c0-2.3 1.8-3.5 4-3.5s4 1.2 4 3.5" />
    <path d="M12.3 12.3c2.4-.3 4.7.7 4.7 3.1" />
  </svg>
);

export const Plus = ({ className }) => (
  <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 20 20"
    className={className}
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M10 4.4v11.2" />
    <path d="M4.4 10h11.2" />
  </svg>
);

