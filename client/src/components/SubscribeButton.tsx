import { useSubscription } from '../hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface SubscribeButtonProps {
  className?: string;
}

export const SubscribeButton: React.FC<SubscribeButtonProps> = ({ className }) => {
  const { subscribe, isLoading, error, price, isIOS } = useSubscription();

  const handleSubscribe = async () => {
    const result = await subscribe();
    if (result.success && !isIOS) {
      return;
    }
    if (result.success && isIOS) {
      window.location.reload();
    }
  };

  return (
    <div>
      <Button
        onClick={handleSubscribe}
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
          `Subscribe - ${price}/month`
        )}
      </Button>
      {error && <p className="text-red-500 mt-2 text-sm" data-testid="text-subscribe-error">{error}</p>}
    </div>
  );
};
