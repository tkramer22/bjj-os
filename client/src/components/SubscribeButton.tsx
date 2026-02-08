import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface SubscribeButtonProps {
  className?: string;
  isLoading?: boolean;
  price?: string;
  isIOS?: boolean;
  onSubscribe: () => Promise<void>;
}

export const SubscribeButton: React.FC<SubscribeButtonProps> = ({ 
  className, 
  isLoading = false,
  price = '$19.99',
  isIOS = false,
  onSubscribe
}) => {
  return (
    <Button
      onClick={onSubscribe}
      disabled={isLoading}
      className={className || 'w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 font-semibold'}
      data-testid="button-subscribe"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        isIOS ? `Subscribe - ${price}/month` : 'Start Your Free Trial'
      )}
    </Button>
  );
};
