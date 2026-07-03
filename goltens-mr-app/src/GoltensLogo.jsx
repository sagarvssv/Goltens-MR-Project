/**
 * GoltensLogo.jsx
 * SVG recreation of the Goltens logo mark + wordmark.
 * Props:
 *   size="md"   — "sm" | "md" | "lg" | "xl"
 *   dark=false  — white wordmark for dark backgrounds
 *   markOnly    — icon only, no wordmark
 */
const SIZES = {
  sm: { icon: 28, font: 14, gap: 6  },
  md: { icon: 40, font: 18, gap: 8  },
  lg: { icon: 56, font: 24, gap: 10 },
  xl: { icon: 80, font: 32, gap: 14 },
};

export default function GoltensLogo({ size = "md", dark = false, markOnly = false, style = {} }) {
  const { icon, font, gap } = SIZES[size] || SIZES.md;
  const w = icon;
  const h = icon;

  return (
    <div style={{ display: "flex", alignItems: "center", gap, ...style }}>
      {/* Icon mark — stylised G block */}
      <svg width={w} height={h} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        {/* Dark navy back panel */}
        <polygon points="10,18 48,4 72,20 72,56 34,70 10,54" fill="#1A3A5C"/>
        {/* Mid blue middle panel */}
        <polygon points="10,26 44,13 66,28 66,56 32,69 10,54" fill="#1B6CA8"/>
        {/* Light blue front panel */}
        <polygon points="10,36 40,24 60,37 60,56 30,68 10,56" fill="#7CB4D4"/>
        {/* White G cutout */}
        <text x="28" y="58" fontFamily="Arial, sans-serif" fontWeight="900"
          fontSize="36" fill="white" letterSpacing="-1">G</text>
      </svg>

      {/* Wordmark */}
      {!markOnly && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
          <span style={{
            fontSize: font,
            fontWeight: 700,
            color: dark ? "#ffffff" : "#1A1A1A",
            fontFamily: "'Segoe UI', Arial, sans-serif",
            letterSpacing: "0.5px",
          }}>
            Goltens
          </span>
          {size !== "sm" && (
            <span style={{
              fontSize: Math.max(font * 0.52, 9),
              color: dark ? "rgba(255,255,255,0.65)" : "#5a7a96",
              fontFamily: "'Segoe UI', Arial, sans-serif",
              marginTop: 1,
            }}>
              Co. Ltd. Dubai Branch
            </span>
          )}
        </div>
      )}
    </div>
  );
}
