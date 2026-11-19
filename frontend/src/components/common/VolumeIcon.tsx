import clsx from 'clsx';

/** Filled speaker and rounded wave strokes, matching the playback control glyphs. */
export default function VolumeIcon({
  volume = 100,
  className,
}: {
  volume?: number;
  className?: string;
}) {
  const waves = volume <= 0 ? 0 : volume <= 33 ? 1 : volume <= 66 ? 2 : 3;
  return (
    <svg
      viewBox="0 0 28 24"
      fill="none"
      aria-hidden="true"
      className={clsx('inline-block size-[1em] shrink-0 align-middle', className)}
    >
      <path
        fill="currentColor"
        d="M11.8 4.1c.7-.6 1.7-.2 1.7.7v14.4c0 .9-1 1.3-1.7.7L6.6 15.5H3.5c-.8 0-1.3-.5-1.3-1.3V9.8c0-.8.5-1.3 1.3-1.3h3.1l5.2-4.4Z"
      />
      <g stroke="currentColor" strokeWidth="1.65" strokeLinecap="round">
        {waves >= 1 && <path d="M16 9.3a4.2 4.2 0 0 1 0 5.4" />}
        {waves >= 2 && <path d="M19 6.5a8.3 8.3 0 0 1 0 11" />}
        {waves >= 3 && <path d="M22 3.7a12.5 12.5 0 0 1 0 16.6" />}
      </g>
    </svg>
  );
}
