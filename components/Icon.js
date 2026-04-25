import BrandLogo from "./BrandLogo";

// ─── SVG ICON SYSTEM ──────────────────────────────────────────────────────────
const Icon = {
  Logo: ({ theme = "dark", size = 24, className = "", alt = "SharePass logo" }) => (
    <BrandLogo theme={theme} size={size} className={className} alt={alt} />
  ),
  Feed: ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="3" rx="1.5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4"/>
      <rect x="2" y="9" width="10" height="3" rx="1.5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" opacity={active ? 1 : 0.6}/>
      <rect x="2" y="15" width="13" height="2.5" rx="1.25" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" opacity={active ? 1 : 0.4}/>
    </svg>
  ),
  Express: ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5 L12.5 8 L18.5 8.5 L14 12.5 L15.5 18.5 L10 15.5 L4.5 18.5 L6 12.5 L1.5 8.5 L7.5 8 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0}/>
    </svg>
  ),
  Chat: ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M17 2H3C2.4 2 2 2.4 2 3v10c0 .6.4 1 1 1h2v3.5L9 14h8c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1z" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0} strokeLinejoin="round"/>
      <circle cx="7" cy="8.5" r="1" fill="currentColor" opacity={active ? 1 : 0.6}/>
      <circle cx="10" cy="8.5" r="1" fill="currentColor" opacity={active ? 1 : 0.6}/>
      <circle cx="13" cy="8.5" r="1" fill="currentColor" opacity={active ? 1 : 0.6}/>
    </svg>
  ),
  Assistant: ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 4.5C4 3.67 4.67 3 5.5 3h9C15.33 3 16 3.67 16 4.5v6.8c0 .83-.67 1.5-1.5 1.5H10l-3.8 3v-3H5.5C4.67 12.8 4 12.13 4 11.3V4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.12 : 0}
      />
      <path
        d="M10 5.2L10.8 7.3L13 8.1L10.8 8.9L10 11L9.2 8.9L7 8.1L9.2 7.3L10 5.2Z"
        fill="currentColor"
        fillOpacity={active ? 0.95 : 0.7}
      />
    </svg>
  ),
  Circles: ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.1 : 0}/>
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0}/>
      <circle cx="10" cy="10" r="1" fill="currentColor"/>
    </svg>
  ),
  Profile: ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.12 : 0}/>
      <path d="M3.5 17.5C3.5 14.5 6.4 12 10 12s6.5 2.5 6.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Sun: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2.9" y1="2.9" x2="4.3" y2="4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="11.7" y1="11.7" x2="13.1" y2="13.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="2.9" y1="13.1" x2="4.3" y2="11.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="11.7" y1="4.3" x2="13.1" y2="2.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Moon: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5 6 6 0 1 0 13.5 10.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Support: ({ filled }) => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M7 12.5C7 12.5 1.5 9 1.5 5C1.5 3.07 3.07 1.5 5 1.5C5.9 1.5 6.72 1.85 7.32 2.43C6.28 3.33 5.5 4.6 5.5 5.5H8.5C8.5 4.6 7.72 3.33 6.68 2.43C7.28 1.85 8.1 1.5 9 1.5C10.93 1.5 12.5 3.07 12.5 5C12.5 9 7 12.5 7 12.5Z" stroke="currentColor" strokeWidth="1.3" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.8 : 0} strokeLinejoin="round"/>
    </svg>
  ),
  Relate: ({ filled }) => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <circle cx="5" cy="7" r="3" stroke="currentColor" strokeWidth="1.3" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.5 : 0}/>
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.3" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.5 : 0}/>
    </svg>
  ),
  Hug: ({ filled }) => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.7 : 0}/>
      <path d="M2 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M1 8c-.5-1 0-2.5 1.5-2s1.5 2 1 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M13 8c.5-1 0-2.5-1.5-2S10 8 10.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Shield: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L2 3.5V7C2 9.76 4.24 12.3 7 13C9.76 12.3 12 9.76 12 7V3.5L7 1Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.1" strokeLinejoin="round"/>
      <path d="M5 7L6.5 8.5L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <path d="M10 2.5V5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 14.5V17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2.5 10H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14.5 10H17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4.2 4.2L6.2 6.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13.8 13.8L15.8 15.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4.2 15.8L6.2 13.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13.8 6.2L15.8 4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Globe: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <ellipse cx="7" cy="7" rx="2.5" ry="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <line x1="1.5" y1="7" x2="12.5" y2="7" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  ),
  Lock: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <rect x="2.5" y="6" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.5 6V4.5A2.5 2.5 0 0 1 9.5 4.5V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="7" cy="9.5" r="1" fill="currentColor"/>
    </svg>
  ),
  Send: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M14 2L7.5 8.5M14 2L2 6L6.5 8L8 13L14 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  ),
  Mic: ({ active }) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="5"
        y="2"
        width="6"
        height="8"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.16 : 0}
      />
      <path d="M3.5 7.8C3.5 10.3 5.07 12 8 12C10.93 12 12.5 10.3 12.5 7.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 12V14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5.5 14H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Spark: () => (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L7.2 4.8L11 6L7.2 7.2L6 11L4.8 7.2L1 6L4.8 4.8L6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="currentColor" fillOpacity="0.3"/>
    </svg>
  ),
  Leaf: () => (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M9 16C9 16 3 12 3 7C3 4.24 5.24 2 8 2C10.5 2 12 3.5 12 3.5C12 3.5 15 4 15 8C15 12 9 16 9 16Z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round"/>
      <path d="M9 16L9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M9 11L12 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Wave: () => (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M2 9C2 9 4 5 6 7C8 9 10 5 12 7C14 9 16 6 16 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 13C2 13 4 9 6 11C8 13 10 9 12 11C14 13 16 10 16 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  Back: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Forward: () => (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Dove: () => (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
      <path d="M18 8C18 8 10 12 8 18C6 24 10 28 16 26C18 25.3 19.5 24 20 22L26 16C28 14 27 10 24 10L20 12L18 8Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" strokeLinejoin="round"/>
      <path d="M20 22L22 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="24" cy="12" r="1" fill="currentColor"/>
    </svg>
  ),
  Heart: () => (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M9 15C9 15 3 11 3 6.5C3 4.5 4.5 3 6.5 3C7.5 3 8.4 3.5 9 4.2C9.6 3.5 10.5 3 11.5 3C13.5 3 15 4.5 15 6.5C15 11 9 15 9 15Z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.2" strokeLinejoin="round"/>
    </svg>
  ),
  Privacy: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L2 4V9C2 12.3 4.7 15.2 8 16C11.3 15.2 14 12.3 14 9V4L8 1Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.1"/>
      <path d="M6 8L7.5 9.5L10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Crisis: () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M10 18C10 18 2 13.5 2 7C2 4.2 4.2 2 7 2C8.2 2 9.3 2.5 10 3.3C10.7 2.5 11.8 2 13 2C15.8 2 18 4.2 18 7C18 13.5 10 18 10 18Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15"/>
    </svg>
  ),
  Close: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Rise: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 11L11.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 3.5H11.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Google: () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2C17.64 8.57 17.58 7.96 17.47 7.36H9V10.84H13.84C13.63 11.97 12.99 12.92 12.05 13.56V15.81H14.95C16.66 14.24 17.64 11.93 17.64 9.2Z" fill="#4285F4"/>
      <path d="M9 18C11.43 18 13.47 17.19 14.95 15.81L12.05 13.56C11.24 14.1 10.22 14.42 9 14.42C6.66 14.42 4.67 12.84 3.97 10.71H0.98V13.03C2.45 15.95 5.48 18 9 18Z" fill="#34A853"/>
      <path d="M3.96 10.71C3.78 10.17 3.68 9.6 3.68 9C3.68 8.4 3.78 7.83 3.96 7.29V4.97H0.98C0.36 6.21 0 7.57 0 9C0 10.43 0.36 11.79 0.98 13.03L3.96 10.71Z" fill="#FBBC04"/>
      <path d="M9 3.58C10.34 3.58 11.55 4.04 12.5 4.94L15.02 2.42C13.47 0.98 11.43 0 9 0C5.48 0 2.45 2.05 0.98 4.97L3.96 7.29C4.67 5.16 6.66 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  ),
  Apple: () => (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M11.68 4.04C12.28 3.32 12.66 2.34 12.58 1.4C11.67 1.46 10.6 2.01 9.99 2.73C9.44 3.37 8.98 4.38 9.09 5.33C10.08 5.41 11.08 4.84 11.68 4.04Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round"/>
      <path d="M9.02 5.63C7.59 5.63 6.37 6.43 5.63 6.43C4.86 6.43 3.81 5.68 2.58 5.71C0.99 5.73 0 6.61 0 8.06C0 9.02 0.35 10.01 0.93 10.96C1.72 12.26 2.77 13.71 4.16 13.66C5.17 13.62 5.55 13.03 6.77 13.03C8 13.03 8.33 13.66 9.42 13.64C10.86 13.62 11.77 12.36 12.51 11.06C13.02 10.16 13.23 9.72 13.62 8.72C10.39 7.48 10.76 3.04 13.16 1.91C12.43 1.03 11.3 0.52 10.22 0.5C8.78 0.46 7.5 1.29 6.74 1.29C5.96 1.29 4.79 0.55 3.58 0.58" transform="translate(2.1 2)" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Mail: () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 14.4V5.4L9 9.72L15 5.4V14.4" stroke="#EA4335" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 5.4L9 9.72L15 5.4" stroke="#EA4335" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 14.4L6.15 10.98" stroke="#4285F4" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M15 14.4L11.85 10.98" stroke="#34A853" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M3.72 4.92H14.28" stroke="#FBBC04" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Guest: () => (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6.2" r="2.8" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3.5 14.5C3.5 11.95 5.96 9.88 9 9.88C12.04 9.88 14.5 11.95 14.5 14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M14.1 4.1L15.3 5.3L17 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

export default Icon;
