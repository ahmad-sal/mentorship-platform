/**
 * Ahmad Saleem Mentorship Platform — Public site controller
 * ------------------------------------------------------------------
 * Pure vanilla JavaScript. No frameworks.
 * Provides self-contained SVG icons, the public course catalogue,
 * FAQ data, view routing, theme control and real platform statistics.
 */

// Self-contained SVG icons for 100% offline & iframe reliability
const SVG_ICONS = {
  'graduation-cap': `<svg class="icon" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  'sun': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  'moon': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  'menu': `<svg class="icon" viewBox="0 0 24 24"><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  'panel-left': `<svg class="icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>`,
  'sparkles': `<svg class="icon" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  'arrow-right': `<svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  'arrow-left': `<svg class="icon" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7M19 12H5"/></svg>`,
  'arrow-up-right': `<svg class="icon" viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10"/></svg>`,
  'chevron-right': `<svg class="icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`,
  'chevron-down': `<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
  'user-plus': `<svg class="icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
  'user': `<svg class="icon" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  'users': `<svg class="icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'log-in': `<svg class="icon" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>`,
  'log-out': `<svg class="icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  'check': `<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  'check-circle-2': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  'check-square': `<svg class="icon" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  'circle-check': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  'upload': `<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  'file-up': `<svg class="icon" viewBox="0 0 24 24"><path d="M14 2v5h5"/><path d="M4 2h10l5 5v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><polyline points="12 18 12 11"/><polyline points="9 14 12 11 15 14"/></svg>`,
  'file-text': `<svg class="icon" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/></svg>`,
  'file-check-2': `<svg class="icon" viewBox="0 0 24 24"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m3 15 2 2 4-4"/></svg>`,
  'rotate-ccw': `<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  'refresh-cw': `<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>`,
  'play-circle': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`,
  'play': `<svg class="icon" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  'clock': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  'award': `<svg class="icon" viewBox="0 0 24 24"><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/></svg>`,
  'shield-check': `<svg class="icon" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  'shield': `<svg class="icon" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  'shield-alert': `<svg class="icon" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  'book-open': `<svg class="icon" viewBox="0 0 24 24"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  'book-plus': `<svg class="icon" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/><path d="M18 15h6M21 12v6"/></svg>`,
  'layers': `<svg class="icon" viewBox="0 0 24 24"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m6.08 12.5-3.48 1.59a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.48-1.59"/></svg>`,
  'target': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  'compass': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  'trending-up': `<svg class="icon" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  'bar-chart': `<svg class="icon" viewBox="0 0 24 24"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`,
  'pie-chart': `<svg class="icon" viewBox="0 0 24 24"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
  'layout-dashboard': `<svg class="icon" viewBox="0 0 24 24"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  'message-square': `<svg class="icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  'help-circle': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  'alert-circle': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  'info': `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  'inbox': `<svg class="icon" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  'mail': `<svg class="icon" viewBox="0 0 24 24"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  'lock': `<svg class="icon" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  'key': `<svg class="icon" viewBox="0 0 24 24"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>`,
  'eye': `<svg class="icon" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  'eye-off': `<svg class="icon" viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 0 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.72 3.86"/><path d="M6.61 6.61A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.39-1.39"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  'phone': `<svg class="icon" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  'id-card': `<svg class="icon" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="5" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M14 10h5M14 14h5M5 15c.7-1.2 1.8-2 3-2s2.3.8 3 2"/></svg>`,
  'calendar': `<svg class="icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>`,
  'send': `<svg class="icon" viewBox="0 0 24 24"><path d="M14.54 2.9a1.9 1.9 0 0 1 2.67 2.5l-7.6 15.5a1.9 1.9 0 0 1-3.4-.3l-2-5.2a1.9 1.9 0 0 1 1-2.4z"/><path d="M21 3 11 13"/></svg>`,
  'plus': `<svg class="icon" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>`,
  'x': `<svg class="icon" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
  'trash-2': `<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
  'settings': `<svg class="icon" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  'search': `<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  'external-link': `<svg class="icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>`,
  'printer': `<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`,
  'star': `<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  'image': `<svg class="icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  'zap': `<svg class="icon" viewBox="0 0 24 24"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
  'loader': `<svg class="icon" viewBox="0 0 24 24"><line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/></svg>`,
  'edit': `<svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`,
  'download': `<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  'gauge': `<svg class="icon" viewBox="0 0 24 24"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>`,
  'flag': `<svg class="icon" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`,
  'lightbulb': `<svg class="icon" viewBox="0 0 24 24"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/></svg>`,
  'rocket': `<svg class="icon" viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
  'home': `<svg class="icon" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>`,
  'activity': `<svg class="icon" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  'alert-triangle': `<svg class="icon" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
  'move-horizontal': `<svg class="icon" viewBox="0 0 24 24"><polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/></svg>`,
  'search-x': `<svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="m13.5 8.5-5 5M8.5 8.5l5 5"/></svg>`
};

function getIcon(name) {
  return SVG_ICONS[name] || `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;
}

// Course catalogue — mirrors the live course tracks on the platform
const INITIAL_COURSES = [
  {
    id: 'c1',
    title: 'YouTube Automation',
    description: 'Master YouTube channel growth, automation tools, and content strategy.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'public/images/yt.png',
    thumb: 'images/thumb-yt.jpeg',
    page: 'course-youtube-automation.html',
    topics: ['Niche research', 'Channel automation', 'YouTube SEO'],
    playlist: 'https://youtube.com/playlist?list=PLfwp9CvuUprE&si=PQzJ7KfoQkhiD6xm',
    highlights: ['Niche and content research', 'Channel automation workflows', 'YouTube SEO and analytics'],
    magic: 'Turn a simple idea into a repeatable content engine that can grow while you focus on the creative direction.',
    tools: 'YouTube Studio, content planning tools, thumbnail workflows, and automation systems',
    bestFor: 'Creators, entrepreneurs, and anyone who wants to build a channel with a clear strategy.'
  },
  {
    id: 'c2',
    title: 'Graphic Designing through Canva',
    description: 'Create stunning graphics with Canva for social media, branding and more.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'public/images/canva.png',
    thumb: 'images/thumb-graphics.jpeg',
    page: 'course-canva.html',
    topics: ['Design fundamentals', 'Brand kits', 'Social graphics'],
    playlist: 'https://youtube.com/playlist?list=PLEUsuq8UIsYA&si=Qs0RNbVoQD7Kdng4',
    highlights: ['Design fundamentals and composition', 'Canva tools and brand kits', 'Social media graphics and exports'],
    magic: 'Make polished visuals feel effortless by turning your ideas into designs that look consistent, clear, and ready to share.',
    tools: 'Canva, brand kits, templates, social media layouts, and visual content systems',
    bestFor: 'Beginners, small businesses, content creators, and anyone who wants stronger visual communication.'
  },
  {
    id: 'c3',
    title: 'Web Development through WordPress',
    description: 'Build professional websites without coding using WordPress.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'public/images/wp.png',
    thumb: 'images/thumb-webdev.jpeg',
    page: 'course-wordpress.html',
    topics: ['Themes & plugins', 'Elementor builds', 'SEO basics'],
    playlist: 'https://youtube.com/playlist?list=PLc0Bqc25RKTg&si=RezB3e_Dcfm7jOqA',
    highlights: ['WordPress setup and configuration', 'Themes, plugins, and page builders', 'Responsive websites and basic SEO'],
    magic: 'Go from a blank domain to a professional online home without needing to write every line of code yourself.',
    tools: 'WordPress, themes, plugins, page builders, hosting dashboards, and SEO tools',
    bestFor: 'Freelancers, business owners, bloggers, and aspiring website builders.'
  },
  {
    id: 'c4',
    title: 'Advanced Artificial Intelligence',
    description: 'Explore AI tools, automation, image/video generation, AI productivity.',
    badge: 'Advanced',
    duration: '2 Months',
    level: 'Advanced',
    image: 'public/images/ai.png',
    thumb: 'images/thumb-ai.jpeg',
    page: 'course-artificial-intelligence.html',
    topics: ['Prompt engineering', 'Image & video AI', 'AI automation'],
    playlist: 'https://youtube.com/playlist?list=PLQTO9V3Zldy4&si=y9dn_XdUIkElVZkj',
    highlights: ['Practical AI tools and workflows', 'Image and video generation', 'AI-powered productivity and automation'],
    magic: 'Use the new generation of AI as a creative partner and productivity engine for ideas, media, and everyday work.',
    tools: 'AI assistants, prompt workflows, image and video generators, and automation tools',
    bestFor: 'Students, professionals, creators, and curious learners who want to work smarter with AI.'
  }
];

const INITIAL_FAQS = [
  {
    q: 'Which course should I start with?',
    a: 'Start with the course that matches your current goal: YouTube Automation for content growth, Canva for visual design, WordPress for websites, or Artificial Intelligence for modern AI tools and workflows.'
  },
  {
    q: 'Are the courses suitable for beginners?',
    a: 'Yes. Each course introduces its main tools and practical concepts step by step, with a clear focus on useful skills rather than unnecessary theory.'
  },
  {
    q: 'What skills will I learn?',
    a: 'You will learn practical skills in content strategy, Canva design, WordPress website building, AI tools, automation, and digital productivity.'
  },
  {
    q: 'How do assignments and mentor review work?',
    a: 'Once you enroll, your course workspace lists every curriculum question. You watch the required video lesson, submit your answer or file, and send the final practical assignment for mentor review from the same workspace.'
  },
  {
    q: 'Do I get a certificate?',
    a: 'Yes. An e-certificate is issued after you complete the course requirements. Your registration name is used on the certificate, which is why the platform asks you to enter it exactly.'
  },
  {
    q: 'Can I switch between daylight and dark mode?',
    a: 'Yes. Use the theme button in the top navigation bar to switch between Daylight and Dark mode at any time. Your choice is remembered on this device.'
  }
];

// App Controller
const app = {
  currentView: 'home',
  theme: 'light',
  currentCourseId: null,
  courses: [...INITIAL_COURSES],

  init() {
    const savedTheme = localStorage.getItem('themePreference');
    this.theme = savedTheme === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', this.theme === 'dark');
    document.body.classList.toggle('light-theme', this.theme === 'light');
    this.renderIcons();
    this.renderAllCourses();
    this.renderHomeCourses();
    this.renderFaqs();
    this.initScrollReveal();
    this.updateThemeToggle();
    this.loadPlatformStats();
    this.renderIcons();
    if (location.hash === '#viewCourses') this.navigate('courses');
  },

  // Icon replacement helper
  renderIcons() {
    document.querySelectorAll('[data-lucide]').forEach(el => {
      const name = el.getAttribute('data-lucide');
      if (name && SVG_ICONS[name]) {
        el.outerHTML = SVG_ICONS[name];
      }
    });
  },

  initScrollReveal() {
    const targets = document.querySelectorAll(
      '.hero-left > *, .hero-right, .how-it-works-card, .faq-section, #viewCourses .page-heading, #allCoursesGrid .course-card'
    );
    targets.forEach((element, index) => {
      element.classList.add('scroll-reveal');
      if (!element.style.getPropertyValue('--reveal-delay')) {
        element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 80}ms`);
      }
    });

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach(element => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    targets.forEach(element => observer.observe(element));
  },

  // Real platform figures from the live API (never fabricated)
  async loadPlatformStats() {
    const nodes = document.querySelectorAll('[data-capacity-stat]');
    if (!nodes.length) return;
    try {
      const res = await fetch('/api/capacity');
      if (!res.ok) throw new Error('capacity unavailable');
      const data = await res.json();
      const current = Number(data.currentStudents);
      const max = Number(data.maxCapacity);
      const remaining = Number(data.remainingSeats);

      const setStat = (key, value, isCount) => {
        const el = document.querySelector(`[data-capacity-stat="${key}"]`);
        if (!el || !isFinite(value)) return;
        if (isCount) {
          el.setAttribute('data-count-to', String(value));
        } else {
          el.textContent = value.toLocaleString();
        }
        const holder = el.closest('[data-stat-holder]');
        if (holder) holder.hidden = false;
      };

      setStat('students', current, true);
      setStat('capacity', max, false);
      setStat('seats', remaining, true);

      const enrollNote = document.querySelector('[data-enroll-note]');
      if (enrollNote) {
        enrollNote.hidden = remaining <= 0;
      }

      if (window.MentorUI && typeof window.MentorUI.refresh === 'function') {
        window.MentorUI.refresh();
      }
    } catch (err) {
      // Show the section without invented numbers rather than misleading claims.
      document.querySelectorAll('[data-stat-holder]').forEach(el => {
        if (el.hasAttribute('data-stat-optional')) el.hidden = true;
      });
    }
  },

  // 1. Navigation Controller
  navigate(viewId, courseId = null) {
    this.currentView = viewId;
    this.currentCourseId = courseId;

    // Update Nav Buttons
    document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById(`nav${viewId.charAt(0).toUpperCase() + viewId.slice(1)}Btn`);
    if (activeNav) activeNav.classList.add('active');

    // Close Mobile Drawer
    const drawer = document.getElementById('mobileDrawer');
    if (drawer) {
      drawer.classList.remove('open');
      const menuButton = document.getElementById('mobileMenuBtn');
      if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
    }

    // Show selected view
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const targetSection = document.getElementById(`view${viewId.charAt(0).toUpperCase() + viewId.slice(1)}`);
    if (targetSection) {
      targetSection.classList.add('active');
      targetSection.querySelectorAll('.scroll-reveal').forEach(el => el.classList.add('is-visible'));
    }

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

    // Refresh icons
    this.renderIcons();
  },

  toggleMobileMenu() {
    const drawer = document.getElementById('mobileDrawer');
    const menuButton = document.getElementById('mobileMenuBtn');
    if (!drawer) return;

    const isOpen = drawer.classList.toggle('open');
    if (menuButton) {
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    }
  },

  // 2. Theme Toggle (Daylight White vs Dark)
  toggleTheme() {
    if (window.MentorUI && typeof window.MentorUI.toggleTheme === 'function') {
      window.MentorUI.toggleTheme();
      this.theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
      this.renderIcons();
      return;
    }
    const body = document.body;

    if (this.theme === 'light') {
      this.theme = 'dark';
      body.classList.remove('light-theme');
      body.classList.add('dark-theme');
    } else {
      this.theme = 'light';
      body.classList.remove('dark-theme');
      body.classList.add('light-theme');
    }

    localStorage.setItem('themePreference', this.theme);
    this.updateThemeToggle();
    this.renderIcons();
  },

  updateThemeToggle() {
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    const button = document.getElementById('themeToggleBtn');
    const darkMode = this.theme === 'dark';
    if (icon) icon.innerHTML = getIcon(darkMode ? 'sun' : 'moon');
    if (label) label.textContent = darkMode ? 'Light Mode' : 'Dark Mode';
    if (button) button.title = darkMode ? 'Switch to light theme' : 'Switch to dark theme';
  },

  // 3. Render Home & Courses
  renderAllCourses() {
    const container = document.getElementById('allCoursesGrid');
    if (!container) return;

    container.innerHTML = this.courses.map(course => `
      <a class="course-card" href="${course.page}" aria-label="Open the ${course.title} course page" data-reveal>
        <div class="course-image-slot">
          ${course.image
            ? `<img src="${course.image}" alt="${course.title}" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML='<span>${course.title}</span>'">`
            : `<span>${course.title}</span>`}
        </div>
        <div class="course-badge-row">
          <span class="badge badge-primary">${course.duration || '6 Weeks'}</span>
          <span class="badge badge-accent">${course.badge || 'Practical'}</span>
        </div>
        <h3 class="course-title">${course.title}</h3>
        <p class="course-desc">${course.description}</p>
        ${Array.isArray(course.topics) ? `
          <div class="course-topics">
            ${course.topics.map(topic => `<span class="topic-chip">${topic}</span>`).join('')}
          </div>` : ''}
        <div class="course-footer">
          <span class="badge badge-neutral">${course.level || 'All Levels'}</span>
          <span class="course-card-cta">View course ${getIcon('arrow-right')}</span>
        </div>
      </a>
    `).join('');

    if (window.MentorUI && typeof window.MentorUI.refresh === 'function') {
      window.MentorUI.refresh();
    }
  },

  renderHomeCourses() {
    const container = document.getElementById('homeCoursesGrid');
    if (!container) return;
    container.innerHTML = this.courses.map(course => `
      <a class="course-card" href="${course.page}" aria-label="Open the ${course.title} course page">
        <div class="course-image-slot">
          ${course.thumb
            ? `<img src="${course.thumb}" alt="${course.title}" loading="lazy" decoding="async" onerror="this.parentNode.innerHTML='<span>${course.title}</span>'">`
            : `<span>${course.title}</span>`}
        </div>
        <div class="course-badge-row">
          <span class="badge badge-primary">${course.duration || '6 Weeks'}</span>
          <span class="badge badge-accent">${course.badge || 'Practical'}</span>
        </div>
        <h3 class="course-title">${course.title}</h3>
        <p class="course-desc">${course.description}</p>
        <div class="course-footer">
          <span class="badge badge-neutral">${course.level || 'All Levels'}</span>
          <span class="course-card-cta">View course ${getIcon('arrow-right')}</span>
        </div>
      </a>
    `).join('');
    if (window.MentorUI && typeof window.MentorUI.refresh === 'function') {
      window.MentorUI.refresh();
    }
  },

  // FAQs
  renderFaqs() {
    const container = document.getElementById('faqList');
    if (!container) return;

    container.innerHTML = INITIAL_FAQS.map((faq, index) => `
      <div class="faq-item" data-reveal>
        <button class="faq-question" type="button" aria-expanded="false" aria-controls="faq-answer-${index}" onclick="app.toggleFaq(this)">
          <span>${faq.q}</span>
          ${getIcon('chevron-down')}
        </button>
        <div class="faq-answer" id="faq-answer-${index}">
          ${faq.a}
        </div>
      </div>
    `).join('');
  },

  toggleFaq(button) {
    const item = button.parentElement;
    if (!item) return;
    const isOpen = item.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));
  },

  // Toast Notification
  showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
};

// Expose the controller on `window` so sibling scripts (dashboard, admin and
// auth pages) can safely guard with `window.app && app.renderIcons()`.
window.app = app;
window.getIcon = getIcon;

// Initialize App once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}