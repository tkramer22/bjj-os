import { useEffect, useState } from "react";

interface BeltIconProps {
  rank?: "white" | "blue" | "purple" | "brown" | "black";
  size?: "small" | "medium" | "large" | "hero";
  className?: string;
  animated?: boolean; // For landing page color rotation
}

const SIZE_DIMENSIONS = {
  small: { width: 125, height: 20 },
  medium: { width: 250, height: 40 },
  large: { width: 400, height: 64 },
  hero: { width: 500, height: 80 },
};

// Belt colors and configurations per IBJJF standards
const BELT_CONFIGS = {
  white: {
    mainColor: "#FFFFFF",
    stripeColor: "#FFFFFF",
    stripeSectionColor: "#000000", // Black stripe section
    showStripes: true, // Show white stripes on black section
    needsBorder: true, // Entire belt needs gray border for visibility
  },
  blue: {
    mainColor: "#2563EB", // IBJJF Blue
    stripeColor: "#FFFFFF",
    stripeSectionColor: "#000000",
    showStripes: true,
    needsBorder: false,
  },
  purple: {
    mainColor: "#7C3AED", // IBJJF Purple
    stripeColor: "#FFFFFF",
    stripeSectionColor: "#000000",
    showStripes: true,
    needsBorder: false,
  },
  brown: {
    mainColor: "#92400E", // IBJJF Brown
    stripeColor: "#FFFFFF",
    stripeSectionColor: "#000000",
    showStripes: true,
    needsBorder: false,
  },
  black: {
    mainColor: "#000000",
    stripeColor: "#FFFFFF",
    stripeSectionColor: "#DC2626", // Red for black belt
    showStripes: true,
    needsBorder: true, // Main section needs white border
  },
};

// Stripe positions (evenly spaced in 50px right section)
const STRIPE_POSITIONS = [458, 468, 479, 489];

export function BeltIcon({ rank = "blue", size = "medium", className = "", animated = false }: BeltIconProps) {
  const dimensions = SIZE_DIMENSIONS[size];
  const [currentRank, setCurrentRank] = useState<"white" | "blue" | "purple" | "brown" | "black">(
    animated ? "white" : rank
  );

  // Animated color rotation for landing page ONLY
  useEffect(() => {
    if (!animated) return;

    const ranks: Array<"white" | "blue" | "purple" | "brown" | "black"> = 
      ["white", "blue", "purple", "brown", "black"];
    let currentIndex = 0;

    // Start with WHITE belt (index 0)
    setCurrentRank("white");

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % ranks.length;
      setCurrentRank(ranks[currentIndex]);
    }, 2000); // Change every 2 seconds

    return () => clearInterval(interval);
  }, [animated]);

  // For static (non-animated) belts, render simple version
  if (!animated) {
    const config = BELT_CONFIGS[rank];
    
    return (
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 500 80"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        data-testid={`belt-icon-${rank}`}
        style={{ filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))" }}
      >
        {/* White belt: main section with gray border + black stripe section */}
        {rank === "white" && (
          <>
            <rect
              x="1"
              y="1"
              width="448"
              height="78"
              fill={config.mainColor}
              stroke="#333333"
              strokeWidth="2"
            />
            <rect
              x="450"
              y="1"
              width="49"
              height="78"
              fill={config.stripeSectionColor}
              stroke="#333333"
              strokeWidth="2"
            />
            {STRIPE_POSITIONS.map((x, i) => (
              <rect key={i} x={x} y="0" width="3" height="80" fill={config.stripeColor} />
            ))}
          </>
        )}

        {/* Black belt: main section with white border, red stripe section no border */}
        {rank === "black" && (
          <>
            <rect
              x="1"
              y="1"
              width="448"
              height="78"
              fill={config.mainColor}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <rect
              x="450"
              y="0"
              width="50"
              height="80"
              fill={config.stripeSectionColor}
            />
            {STRIPE_POSITIONS.map((x, i) => (
              <rect key={i} x={x} y="0" width="3" height="80" fill={config.stripeColor} />
            ))}
          </>
        )}

        {/* Blue, Purple, Brown belts: no borders */}
        {rank !== "white" && rank !== "black" && (
          <>
            <rect
              x="0"
              y="0"
              width="450"
              height="80"
              fill={config.mainColor}
            />
            <rect
              x="450"
              y="0"
              width="50"
              height="80"
              fill={config.stripeSectionColor}
            />
            {config.showStripes && STRIPE_POSITIONS.map((x, i) => (
              <rect key={i} x={x} y="0" width="3" height="80" fill={config.stripeColor} />
            ))}
          </>
        )}
      </svg>
    );
  }

  // For animated belts, render all layers with opacity transitions
  const ranks: Array<"white" | "blue" | "purple" | "brown" | "black"> = 
    ["white", "blue", "purple", "brown", "black"];

  return (
    <svg
      width={dimensions.width}
      height={dimensions.height}
      viewBox="0 0 500 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      data-testid={`belt-icon-${currentRank}`}
      style={{ filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.4))" }}
    >
      {ranks.map((r) => {
        const config = BELT_CONFIGS[r];
        const isVisible = r === currentRank;
        
        return (
          <g
            key={r}
            style={{
              opacity: isVisible ? 1 : 0,
              transition: "opacity 0.5s ease-in-out"
            }}
          >
            {/* White belt: main section with gray border + black stripe section */}
            {r === "white" && (
              <>
                <rect
                  x="1"
                  y="1"
                  width="448"
                  height="78"
                  fill={config.mainColor}
                  stroke="#333333"
                  strokeWidth="2"
                />
                <rect
                  x="450"
                  y="1"
                  width="49"
                  height="78"
                  fill={config.stripeSectionColor}
                  stroke="#333333"
                  strokeWidth="2"
                />
                {STRIPE_POSITIONS.map((x, i) => (
                  <rect key={i} x={x} y="0" width="3" height="80" fill={config.stripeColor} />
                ))}
              </>
            )}

            {/* Black belt: main section with white border, red stripe section no border */}
            {r === "black" && (
              <>
                <rect
                  x="1"
                  y="1"
                  width="448"
                  height="78"
                  fill={config.mainColor}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
                <rect
                  x="450"
                  y="0"
                  width="50"
                  height="80"
                  fill={config.stripeSectionColor}
                />
                {STRIPE_POSITIONS.map((x, i) => (
                  <rect key={i} x={x} y="0" width="3" height="80" fill={config.stripeColor} />
                ))}
              </>
            )}

            {/* Blue, Purple, Brown belts: no borders */}
            {r !== "white" && r !== "black" && (
              <>
                <rect
                  x="0"
                  y="0"
                  width="450"
                  height="80"
                  fill={config.mainColor}
                />
                <rect
                  x="450"
                  y="0"
                  width="50"
                  height="80"
                  fill={config.stripeSectionColor}
                />
                {config.showStripes && STRIPE_POSITIONS.map((x, i) => (
                  <rect key={i} x={x} y="0" width="3" height="80" fill={config.stripeColor} />
                ))}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
