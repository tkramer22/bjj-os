import { useRef, useEffect, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  error?: string;
  disabled?: boolean;
  length?: number;
}

export function CodeInput({ 
  value, 
  onChange, 
  onComplete, 
  error, 
  disabled,
  length = 6 
}: CodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Auto-focus first input on mount
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    // Auto-submit when complete
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  const handleChange = (index: number, digit: string) => {
    // Only allow digits
    if (!/^\d*$/.test(digit)) return;

    const newValue = value.split('');
    newValue[index] = digit;
    const updatedValue = newValue.join('').slice(0, length);
    
    onChange(updatedValue);

    // Auto-tab to next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      // Backspace on empty input - go to previous
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pastedData);
    
    // Focus the next empty input or last input
    const nextIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="code-input-0">Verification Code</Label>
      <div className="flex gap-2 justify-center">
        {Array.from({ length }).map((_, index) => (
          <Input
            key={index}
            id={`code-input-${index}`}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            disabled={disabled}
            className={`w-12 h-14 text-center text-2xl font-semibold ${
              error ? 'border-destructive' : ''
            }`}
            data-testid={`input-code-${index}`}
          />
        ))}
      </div>
      {error && (
        <p className="text-sm text-destructive text-center" data-testid="text-code-error">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground text-center">
        Enter the 6-digit code sent to your phone
      </p>
    </div>
  );
}
