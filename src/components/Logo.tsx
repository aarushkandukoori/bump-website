export const LOGO_SRC = `${import.meta.env.BASE_URL}bump-logo.png`;
export const LOGO_ASPECT = 724 / 345;

interface LogoProps {
  height?: number;
  showText?: boolean;
  className?: string;
}

export function Logo({ height = 32, showText = true, className = '' }: LogoProps) {
  const width = Math.round(height * LOGO_ASPECT);

  return (
    <div className={`logo ${className}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <img
        src={LOGO_SRC}
        alt="BUMP"
        width={width}
        height={height}
        style={{ display: 'block', objectFit: 'contain' }}
      />
      {showText && (
        <span
          style={{
            fontSize: height * 0.45,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}
        >
          BUMP
        </span>
      )}
    </div>
  );
}
