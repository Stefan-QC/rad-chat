/** Bevat alle iconen als SVG-symbolen; <Icon name="send" /> verwijst ernaar. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs dangerouslySetInnerHTML={{ __html: `
    <symbol id="logo" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#D71920"/>
      <circle cx="30" cy="34" r="22" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>
      <circle cx="36" cy="28" r="20" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>
      <circle cx="32" cy="32" r="14" fill="none" stroke="#fff" stroke-width="5"/>
      <path d="M33 33 L44 44" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    </symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z"/></symbol>
    <symbol id="i-users" viewBox="0 0 24 24"><path fill="currentColor" d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.300 0-7 1.200-7 3.500V19h14v-2.500C15 14.200 10.300 13 8 13zm8 0c-.300 0-.600 0-1 .100 1.200.800 2 1.900 2 3.400V19h6v-2.500c0-2.300-4.700-3.500-7-3.500z"/></symbol>
    <symbol id="i-menu" viewBox="0 0 24 24"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></symbol>
    <symbol id="i-cube" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7zm0 2.3L18.800 8 12 11.700 5.200 8zM5 9.700l6 3.300v6.800l-6-3.300zm8 10.100v-6.800l6-3.300v6.800z"/></symbol>
    <symbol id="i-speaker" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9zm13.500 3A4.500 4.500 0 0 0 14 8v8a4.500 4.500 0 0 0 2.500-4zM14 3.200v2.100a7 7 0 0 1 0 13.400v2.100a9 9 0 0 0 0-17.600z"/></symbol>
    <symbol id="i-mic" viewBox="0 0 24 24"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.900V21h2v-3.100A7 7 0 0 0 19 11z"/></symbol>
    <symbol id="i-mic-off" viewBox="0 0 24 24"><path fill="currentColor" d="M19 11h-2a5 5 0 0 1-.700 2.500l1.500 1.500A7 7 0 0 0 19 11zM15 11V5a3 3 0 0 0-5.700-1.300L15 9.400zM4.300 3 3 4.300l6 6V11a3 3 0 0 0 4.500 2.600l1.500 1.500a5 5 0 0 1-8-4.100H5a7 7 0 0 0 6 6.900V21h2v-3.100a7 7 0 0 0 2.600-.900l4.100 4.100L21 19.700z"/></symbol>
    <symbol id="i-phone-off" viewBox="0 0 24 24"><path fill="currentColor" d="M12 9c-1.600 0-3.200.300-4.600.700v3.100c0 .400-.200.700-.600.900-.900.400-1.700 1-2.400 1.600-.200.200-.500.300-.700.300s-.500-.100-.700-.300L.300 13.700a1 1 0 0 1-.300-.700c0-.300.100-.500.300-.700C3.400 9.400 7.500 8 12 8s8.600 1.400 11.700 4.300c.200.200.300.400.300.700s-.100.500-.300.700l-2.400 2.400c-.200.200-.400.300-.700.300s-.500-.100-.700-.300c-.700-.700-1.500-1.200-2.400-1.600-.400-.200-.600-.500-.600-.900V9.700C15.200 9.300 13.600 9 12 9z"/></symbol>
    <symbol id="i-grid" viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path fill="currentColor" d="M4 11h12.200l-5.600-5.600L12 4l8 8-8 8-1.400-1.400 5.600-5.600H4z"/></symbol>
    <symbol id="i-stats" viewBox="0 0 24 24"><path fill="currentColor" d="M16 11V3H8v6H2v12h20V11zm-6-6h4v14h-4zm-6 6h4v8H4zm16 8h-4v-6h4z"/></symbol>
    <symbol id="i-gear" viewBox="0 0 24 24"><path fill="currentColor" d="M19.400 13a7.500 7.500 0 0 0 0-2l2.100-1.600-2-3.500-2.500 1a7.300 7.300 0 0 0-1.700-1L15 3h-4l-.400 2.900a7.300 7.300 0 0 0-1.700 1l-2.500-1-2 3.500L6.600 11a7.500 7.500 0 0 0 0 2l-2.100 1.600 2 3.500 2.500-1c.500.400 1.100.700 1.700 1L11 21h4l.400-2.900c.600-.300 1.200-.600 1.700-1l2.500 1 2-3.500zM13 15.500a3.500 3.500 0 1 1 0-7 3.500 3.500 0 0 1 0 7z"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9zm3 11.500a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></symbol>
    <symbol id="i-chat" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.400 17.600 5 12 10.600 6.400 5 5 6.400 10.600 12 5 17.600 6.400 19 12 13.400 17.600 19 19 17.600 13.400 12z"/></symbol>
    <symbol id="i-smile" viewBox="0 0 24 24"><path fill="currentColor" d="M11.990 2C6.470 2 2 6.480 2 12s4.470 10 9.990 10C17.520 22 22 17.520 22 12S17.520 2 11.990 2zM12 20c-4.420 0-8-3.580-8-8s3.580-8 8-8 8 3.580 8 8-3.580 8-8 8zm3.500-9a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3zm-7 0a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3zm3.500 6.500c2.330 0 4.310-1.460 5.110-3.500H6.890c.800 2.040 2.780 3.500 5.110 3.500z"/></symbol>
    <symbol id="i-trophy" viewBox="0 0 24 24"><path fill="currentColor" d="M19 5h-2V3H7v2H5a2 2 0 0 0-2 2v1c0 2.550 1.920 4.630 4.390 4.940A5 5 0 0 0 11 15.900V19H7v2h10v-2h-4v-3.100a5 5 0 0 0 3.610-2.960C19.080 12.630 21 10.550 21 8V7a2 2 0 0 0-2-2zM5 8V7h2v3.820C5.840 10.400 5 9.300 5 8zm14 0c0 1.300-.840 2.400-2 2.820V7h2z"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1 3 5v6c0 5.550 3.840 10.740 9 12 5.160-1.260 9-6.450 9-12V5zm-1 15-4-4 1.400-1.400L11 13.200l4.600-4.600L17 10z"/></symbol>
    <symbol id="i-logout" viewBox="0 0 24 24"><path fill="currentColor" d="M10 17v-3H3v-4h7V7l5 5zm9-14h-7v2h7v14h-7v2h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.500l-1-1h-5l-1 1H5v2h14z"/></symbol>
    <symbol id="i-edit" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.300V21h3.700L17.800 9.900l-3.700-3.700zM20.700 7a1 1 0 0 0 0-1.400l-2.300-2.300a1 1 0 0 0-1.400 0l-1.800 1.800 3.700 3.700z"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-2.670 0-8 1.340-8 4v2h16v-2c0-2.660-5.330-4-8-4z"/></symbol>
    <symbol id="i-hash" viewBox="0 0 24 24"><path fill="currentColor" d="M9 3 8 8H4v2h3.600l-.8 4H3v2h3.400L5.500 21h2l.9-5h4.100l-.9 5h2l.9-5H20v-2h-3.600l.8-4H21V8h-3.400l.9-5h-2l-.9 5H11.500l.9-5zm-.6 7h4.100l-.8 4H7.600z"/></symbol>
` }} />
    </svg>
  );
}

export function Icon({ name, size, className }: { name: string; size?: number; className?: string }) {
  const href = name === 'logo' ? '#logo' : `#i-${name}`;
  return (
    <svg width={size} height={size} className={className} aria-hidden="true">
      <use href={href} />
    </svg>
  );
}
