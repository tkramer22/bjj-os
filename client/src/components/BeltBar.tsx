interface BeltBarProps {
  color: 'white' | 'blue' | 'purple' | 'brown' | 'black';
  stripes?: number;
  selected?: boolean;
  onClick?: () => void;
}

const BELT_COLORS = {
  white: '#FFFFFF',
  blue: '#1E3A8A',
  purple: '#7C3AED',
  brown: '#78350F',
  black: '#000000',
};

export function BeltBar({ color, stripes = 0, selected = false, onClick }: BeltBarProps) {
  const beltColor = BELT_COLORS[color];
  const stripeColor = color === 'black' ? '#DC2626' : '#000000'; // Red for black belt, black for others
  const isWhiteBelt = color === 'white';
  
  return (
    <div
      onClick={onClick}
      className="relative w-full h-12 cursor-pointer transition-none"
      style={{
        backgroundColor: beltColor,
        border: selected ? '2px solid white' : isWhiteBelt ? '1px solid #333' : 'none',
      }}
      data-testid={`belt-${color}`}
    >
      {/* IBJJF Regulation Stripes - RIGHT SIDE, VERTICAL */}
      {stripes > 0 && (
        <div 
          className="absolute flex flex-col justify-center h-full"
          style={{ right: '16px', gap: '8px' }} // IBJJF: 5cm from end, 8px spacing
        >
          {[...Array(stripes)].map((_, i) => (
            <div
              key={i}
              className="stripe"
              style={{
                width: '4px',
                height: '32px',
                backgroundColor: stripeColor,
              }}
              data-testid={`stripe-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
