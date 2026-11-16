"use client";

function setLogo(next: "noodle" | "classic") {
  document.documentElement.dataset.logo = next;
  try {
    localStorage.setItem("sdl-logo", next);
    const url = new URL(window.location.href);
    url.searchParams.set("logo", next);
    window.history.replaceState(null, "", url);
  } catch {
    // private mode
  }
}

function NoodleMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden="true"
      className="noodle-mark shrink-0"
    >
      <defs>
        <linearGradient id="noodle-ink" x1="6" y1="4" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--amber-deep)" />
          <stop offset="0.55" stopColor="var(--amber)" />
          <stop offset="1" stopColor="var(--brick)" />
        </linearGradient>
      </defs>

      <path
        d="M17 4.6c-4.9 0-8.2 3.3-8.2 7.8 0 2.9 1.5 4.5 2.8 6 .8.9 1.2 1.8 1.2 2.9h8.4c0-1.1.4-2 1.2-2.9 1.3-1.5 2.8-3.1 2.8-6 0-4.5-3.3-7.8-8.2-7.8Z"
        stroke="url(#noodle-ink)"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 13.2c1.2-1.7 2.3-1.7 3.5 0s2.3 1.7 3.5 0"
        stroke="url(#noodle-ink)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M13.4 24.1h7.2M14.8 27.2h4.4" stroke="url(#noodle-ink)" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M25.6 8.4c1.7-.6 2.8-1.9 2.4-3.3"
        stroke="var(--amber)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M8.1 7.1c-1.2-1-1.3-2.4-.4-3.4"
        stroke="var(--brick)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="27.4" cy="15.1" r="1.05" fill="var(--amber)" />
      <circle cx="6.4" cy="15.4" r="0.85" fill="var(--brick)" opacity="0.8" />
      <path d="M17 2.2v1.9M27.9 5.2l-1.2 1.5M6.1 5.2l1.2 1.5" stroke="var(--amber-deep)" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

function Squiggle() {
  return (
    <svg
      width="126"
      height="7"
      viewBox="0 0 126 7"
      fill="none"
      aria-hidden="true"
      className="noodle-squiggle mt-1"
    >
      <path
        d="M2 4.2c9-3 15.5 2 24.5-.4S41 1.6 49.5 3.9s14 1 22-1.1 15.5 1.6 23.5-.5 15 1.6 27 .4"
        stroke="var(--amber)"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.95"
      />
    </svg>
  );
}

export function BrandLogo() {
  const toggle = () => {
    const current = document.documentElement.dataset.logo === "classic" ? "classic" : "noodle";
    setLogo(current === "noodle" ? "classic" : "noodle");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="คลิกเพื่อสลับโลโก้"
      aria-label="สลับโลโก้ SmartDeskLight"
      className="logo-wrap flex min-w-0 items-center text-left"
    >
      <span className="logo-classic flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-amber/30 bg-amber-soft text-amber-deep">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.6 3.6h6.8l3.4 7.2H5.2z" />
            <path d="M12 10.8v4.4" />
            <path d="M9.2 18.6h5.6" />
            <path d="M10 21.2h4" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block font-display text-[20px] font-semibold leading-none tracking-[-0.01em]">
            SmartDeskLight
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-muted">
            แผงควบคุมแสงโต๊ะ · desk light console
          </span>
        </span>
      </span>

      <span className="logo-noodle flex items-center gap-2.5">
        <NoodleMark />
        <span className="flex min-w-0 flex-col justify-center">
          <span className="noodle-word">SmartDeskLight</span>
          <Squiggle />
        </span>
      </span>
    </button>
  );
}
