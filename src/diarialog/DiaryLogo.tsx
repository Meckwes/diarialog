interface MarkProps {
  size?: number
  className?: string
}

/**
 * Marca do DiáriaLog — a folha de diário com o "visto" que escapa do canto.
 * Caminho puro, sem dependência de fonte.
 */
export function DiaryMark({ size = 36, className = '' }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="DiáriaLog"
    >
      <defs>
        <linearGradient id="dlm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#BEF264" />
          <stop offset="0.5" stopColor="#84CC16" />
          <stop offset="1" stopColor="#4D7C0F" />
        </linearGradient>
        <radialGradient id="dlm-aurora" cx="0.26" cy="0.14" r="0.72">
          <stop offset="0" stopColor="#F7FEE7" stopOpacity="0.7" />
          <stop offset="1" stopColor="#F7FEE7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dlm-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="dlm-clip">
          <rect width="64" height="64" rx="16" />
        </clipPath>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dlm-bg)" />
      <g clipPath="url(#dlm-clip)">
        <rect width="64" height="30" fill="url(#dlm-sheen)" />
        <rect width="64" height="64" fill="url(#dlm-aurora)" />
      </g>
      <rect x="10" y="15" width="30" height="35" rx="9" fill="#0A0F1A" />
      <path
        d="M15.5 32 L25 41.5 L50.5 12"
        fill="none"
        stroke="#F7FEE7"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DiaryWordmark({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <DiaryMark size={size} className="shadow-[0_8px_24px_-10px_rgba(132,204,22,.8)]" />
      <span className="font-display text-[1.05rem] font-extrabold tracking-tight text-slate-900">
        Diária<span className="gradient-lime">Log</span>
      </span>
    </div>
  )
}
