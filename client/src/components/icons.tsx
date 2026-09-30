import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Logotipo de Reddit, relleno (no usa Base porque es una marca sólida). */
export function IconReddit(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199a1.999 1.999 0 1 1 0 4 1.999 1.999 0 0 1 0-4ZM12.523 11.37c1.863 0 3.375.672 3.375 1.502s-1.512 1.502-3.375 1.502-3.375-.672-3.375-1.502 1.512-1.502 3.375-1.502Zm-4.911 1.328a1.999 1.999 0 1 1 0 4 1.999 1.999 0 0 1 0-4Zm10.334-1.422a2.002 2.002 0 1 1 0 4 2.002 2.002 0 0 1 0-4Z" />
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" />
    </Base>
  );
}

export function IconLeads(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M21 11.5a8.5 8.5 0 1 1-4.2-7.4" />
      <path d="M12 7.5v4.5l3 2" />
      <path d="M21 4v4h-4" />
    </Base>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.6 4.4-5.5 8-5.5s6.5 1.9 8 5.5" />
    </Base>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5Z" />
      <path d="M18.5 16.5 19.2 19l2.3.8-2.3.8-.7 2.4" />
    </Base>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
    </Base>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Base>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 5h5v5" />
      <path d="M19 5 11 13" />
      <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" />
    </Base>
  );
}

export function IconUpvote(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5.5 5.5 12l2 2L12 9.5 16.5 14l2-2L12 5.5Z" />
      <path d="M5.5 15v3.5h13V15" />
    </Base>
  );
}

export function IconComment(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 12c0 3.9-3.6 7-8 7a9 9 0 0 1-2.5-.35L5 20l1.4-3.3C5.5 15.5 4 13.8 4 12c0-3.9 3.6-7 8-7s8 3.1 8 7Z" />
    </Base>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 11a8 8 0 0 0-13.7-4.6L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 13.7 4.6L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </Base>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14 6V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1" />
      <path d="M18 15.5 21.5 12 18 8.5" />
      <path d="M21 12H10" />
    </Base>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
    </Base>
  );
}

export function IconBookmark(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20l-6-3.5L6 20V5.5Z" />
    </Base>
  );
}

export function IconLink(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" />
      <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5" />
    </Base>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Base>
  );
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Base>
  );
}
