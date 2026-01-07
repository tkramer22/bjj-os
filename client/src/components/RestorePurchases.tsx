import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ApplePurchaseService } from '../services/applePurchase';
import { queryClient } from '@/lib/queryClient';

export const RestorePurchases: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  if (!ApplePurchaseService.isIOS()) return null;

  const handleRestore = async () => {
    setIsLoading(true);
    
    try {
      const result = await ApplePurchaseService.restorePurchases();
      
      if (result.success) {
        if (result.restored > 0) {
          queryClient.invalidateQueries({ queryKey: ['/api/user/subscription-status'] });
          toast({
            title: 'Purchases Restored',
            description: 'Your subscription has been restored successfully.',
          });
        } else {
          toast({
            title: 'No Purchases Found',
            description: 'No previous purchases were found to restore.',
          });
        }
      } else {
        toast({
          title: 'Restore Failed',
          description: result.error || 'Failed to restore purchases',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to restore purchases',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleRestore}
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
