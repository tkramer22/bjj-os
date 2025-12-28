import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PhoneInputProps {
  value: string;
  onChange: (phone: string) => void;
  error?: string;
  disabled?: boolean;
}

const countryCodes = [
  { code: "+1", country: "US/CA", flag: "🇺🇸" },
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+44", country: "UK", flag: "🇬🇧" },
  { code: "+61", country: "AU", flag: "🇦🇺" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
];

export function PhoneInput({ value, onChange, error, disabled }: PhoneInputProps) {
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Parse initial value
  useEffect(() => {
    if (value) {
      const matchedCode = countryCodes.find(c => value.startsWith(c.code));
      if (matchedCode) {
        setCountryCode(matchedCode.code);
        setPhoneNumber(value.slice(matchedCode.code.length));
      }
    }
  }, []);

  // Update parent when country code or phone changes
  useEffect(() => {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber) {
      onChange(`${countryCode}${cleanNumber}`);
    } else {
      onChange('');
    }
  }, [countryCode, phoneNumber]);

  const formatPhoneNumber = (input: string) => {
    const cleaned = input.replace(/\D/g, '');
    
    // US/CA formatting (country code +1)
    if (countryCode === "+1") {
      if (cleaned.length <= 3) return cleaned;
      if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
    }
    
    // Other countries - simple formatting
    if (cleaned.length <= 4) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`;
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const cleaned = input.replace(/\D/g, '');
    
    // Limit to 10 digits for US/CA, 11 for others
    const maxLength = countryCode === "+1" ? 10 : 11;
    if (cleaned.length <= maxLength) {
      setPhoneNumber(formatPhoneNumber(cleaned));
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="phone-input">Phone Number</Label>
      <div className="flex gap-2">
        <Select
          value={countryCode}
          onValueChange={setCountryCode}
          disabled={disabled}
        >
          <SelectTrigger 
            className="w-[140px]" 
            data-testid="select-country-code"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countryCodes.map((country) => (
              <SelectItem 
                key={country.code} 
                value={country.code}
                data-testid={`option-country-${country.code}`}
              >
                <span className="flex items-center gap-2">
                  <span>{country.flag}</span>
                  <span>{country.code}</span>
                  <span className="text-muted-foreground text-xs">{country.country}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <div className="flex-1">
          <Input
            id="phone-input"
            type="tel"
            placeholder={countryCode === "+1" ? "(555) 123-4567" : "5551234567"}
            value={phoneNumber}
            onChange={handlePhoneChange}
            disabled={disabled}
            className={error ? "border-destructive" : ""}
            data-testid="input-phone-number"
          />
          {error && (
            <p className="text-sm text-destructive mt-1" data-testid="text-phone-error">
              {error}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        We'll send you a verification code via SMS
      </p>
    </div>
  );
}
