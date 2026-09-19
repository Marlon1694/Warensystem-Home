import type { ReactElement, SVGProps } from 'react';
import type { LocationKind } from '../types';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 22, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Icon {...p}><path d="M3 10.2 12 3l9 7.2" /><path d="M5.5 9.3V20h13V9.3" /><path d="M9.6 20v-5.4h4.8V20" /></Icon>
);

export const IconStock = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="3.5" width="18" height="6" rx="1.6" /><path d="M4.8 9.5v9a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6v-9" /><path d="M9.8 14h4.4" /></Icon>
);

export const IconScan = (p: IconProps) => (
  <Icon {...p}><path d="M3 8V5.6A2.6 2.6 0 0 1 5.6 3H8" /><path d="M16 3h2.4A2.6 2.6 0 0 1 21 5.6V8" /><path d="M21 16v2.4a2.6 2.6 0 0 1-2.6 2.6H16" /><path d="M8 21H5.6A2.6 2.6 0 0 1 3 18.4V16" /><path d="M7 8.5v7M10.2 8.5v7M13.8 8.5v7M17 8.5v7" /></Icon>
);

export const IconCart = (p: IconProps) => (
  <Icon {...p}><path d="M2.6 3.5h2.2l2.3 11a1.7 1.7 0 0 0 1.7 1.3h8.4a1.7 1.7 0 0 0 1.7-1.3l1.5-7H6" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="17.5" cy="20" r="1.3" /></Icon>
);

export const IconChart = (p: IconProps) => (
  <Icon {...p}><path d="M3 20.2h18" /><rect x="5" y="11" width="3.6" height="6.4" rx="1" /><rect x="10.2" y="6.4" width="3.6" height="11" rx="1" /><rect x="15.4" y="13.6" width="3.6" height="3.8" rx="1" /></Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.6-1.1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.2a1.8 1.8 0 1 1 0-3.6h.2A1.5 1.5 0 0 0 5.7 7.6l-.1-.1A1.8 1.8 0 1 1 8.2 4.9l.1.1a1.5 1.5 0 0 0 2.6-1.1v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.5 1.5 0 0 0 2.6 1.1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1.1 2.6h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z" /></Icon>
);

export const IconPlus = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconMinus = (p: IconProps) => <Icon {...p}><path d="M5 12h14" /></Icon>;
export const IconClose = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const IconCheck = (p: IconProps) => <Icon {...p}><path d="m4.5 12.5 5 5 10-11" /></Icon>;
export const IconChevron = (p: IconProps) => <Icon {...p}><path d="m9 5 7 7-7 7" /></Icon>;
export const IconBack = (p: IconProps) => <Icon {...p}><path d="m15 5-7 7 7 7" /></Icon>;

export const IconSearch = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="6.4" /><path d="m20 20-3.6-3.6" /></Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}><path d="M4 6.5h16" /><path d="M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" /><path d="M6.4 6.5 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" /></Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}><path d="M4 20h4.2L19 9.2a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8Z" /><path d="m14 6.5 3.5 3.5" /></Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}><path d="M12 4.2 2.8 19.4h18.4Z" /><path d="M12 10v4" /><path d="M12 17.2h.01" /></Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.6" /><path d="M12 7v5.3l3.3 2" /></Icon>
);

export const IconSort = (p: IconProps) => (
  <Icon {...p}><path d="M7.5 4.5v15" /><path d="M4 8l3.5-3.5L11 8" /><path d="M16.5 19.5v-15" /><path d="M13 16l3.5 3.5L20 16" /></Icon>
);

export const IconMove = (p: IconProps) => (
  <Icon {...p}><path d="M4 8.5h13" /><path d="m13.5 5 3.5 3.5-3.5 3.5" /><path d="M20 15.5H7" /><path d="M10.5 12 7 15.5 10.5 19" /></Icon>
);

export const IconCamera = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 8.8A1.8 1.8 0 0 1 5.3 7h1.9l1.3-2.2h7l1.3 2.2h1.9a1.8 1.8 0 0 1 1.8 1.8v9A1.8 1.8 0 0 1 18.7 20H5.3a1.8 1.8 0 0 1-1.8-1.8Z" /><circle cx="12" cy="13" r="3.4" /></Icon>
);

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 4.5V10h-5.5" /></Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 19.5h15" /></Icon>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p}><path d="M12 15V4" /><path d="m7.5 8 4.5-4.5L16.5 8" /><path d="M4.5 19.5h15" /></Icon>
);

export const IconSun = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" /></Icon>
);

export const IconMoon = (p: IconProps) => (
  <Icon {...p}><path d="M20.5 14.3A8.7 8.7 0 0 1 9.7 3.5a8.7 8.7 0 1 0 10.8 10.8Z" /></Icon>
);

/* Lagerorte ---------------------------------------------------------------- */

const IconFridge = (p: IconProps) => (
  <Icon {...p}><rect x="5.5" y="2.8" width="13" height="18.4" rx="2.4" /><path d="M5.5 10.2h13" /><path d="M8.6 6.2v2M8.6 12.8v2.4" /></Icon>
);

const IconFreezer = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v18" /><path d="m4.2 7.5 15.6 9" /><path d="m19.8 7.5-15.6 9" /><path d="M9.4 4.6 12 7.2l2.6-2.6M9.4 19.4 12 16.8l2.6 2.6" /></Icon>
);

const IconPantry = (p: IconProps) => (
  <Icon {...p}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 12h17" /><path d="M9 7.5v2M15 14.5v2" /></Icon>
);

const IconCellar = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 9.5 12 4l8.5 5.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9 20v-4.5h6V20" /><path d="M9 12.5h6" /></Icon>
);

const IconKitchen = (p: IconProps) => (
  <Icon {...p}><path d="M7 3v7a2.5 2.5 0 0 0 5 0V3" /><path d="M9.5 10v11" /><path d="M17.5 3c-1.7 1.2-2.5 3-2.5 5.4 0 1.6.8 2.6 2.5 2.9V21" /></Icon>
);

const IconBox = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8 3.5 16.5Z" /><path d="M3.5 7.5 12 11.8l8.5-4.3" /><path d="M12 11.8v9" /></Icon>
);

const LOCATION_ICONS: Record<LocationKind, (p: IconProps) => ReactElement> = {
  fridge: IconFridge,
  freezer: IconFreezer,
  pantry: IconPantry,
  cellar: IconCellar,
  kitchen: IconKitchen,
  other: IconBox,
};

export function LocationIcon({ kind, ...props }: IconProps & { kind: LocationKind }) {
  const Component = LOCATION_ICONS[kind] ?? IconBox;
  return <Component {...props} />;
}
