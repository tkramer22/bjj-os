import { useSubscription } from '../hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export const RestorePurchases: React.FC = () => {
  const { restorePurchases, isLoading, isIOS } = useSubscription();

  if (!isIOS) return null;

  return (
    <Button
      onClick={restorePurchases}
      disabled={isLoading}
      variant="link"
      className="text-blue-400 text-sm"
      data-testid="button-restore-purchases"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Restoring...
        </>
      ) : (
        'Restore Purchases'
      )}
    </Button>
  );
};
