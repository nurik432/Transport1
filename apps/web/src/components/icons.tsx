/** Minimal inline icon set (Lucide-style strokes). Decorative by default. */
import type { SVGProps } from "react";

function Base({ children, ...props }: SVGProps<SVGSVGElement> & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5 shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20h14V9.8" />
  </Base>
);

export const IconRoute = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.5 5H15a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h6.5" />
  </Base>
);

export const IconMap = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m9 4-6 2.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Z" />
    <path d="M9 4v14M15 6.5v14" />
  </Base>
);

export const IconBell = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.3 21a2 2 0 0 0 3.4 0" />
  </Base>
);

export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
  </Base>
);

export const IconBus = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11" />
    <path d="M5 11h14M4 17h16" />
    <circle cx="8" cy="19" r="1.4" />
    <circle cx="16" cy="19" r="1.4" />
  </Base>
);

export const IconPin = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Base>
);

export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Base>
);

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Base>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17 14.9c2.4.5 4 2.3 4 5.1" />
  </Base>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

export const IconChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m9 5 7 7-7 7" />
  </Base>
);

export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Base>
);

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8L12 4Z" />
  </Base>
);

export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Base>
);

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" />
  </Base>
);

export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Base>
);

export const IconNavigation = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M3 11 21 3l-8 18-2-8-8-2Z" />
  </Base>
);

export const IconLocate = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="7" />
  </Base>
);

export const IconExpand = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </Base>
);

export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);
