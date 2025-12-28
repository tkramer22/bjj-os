import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BeltBar } from "@/components/BeltBar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type BeltColor = 'white' | 'blue' | 'purple' | 'brown' | 'black';

const BELTS: Array<{ color: BeltColor; label: string }> = [
  { color: 'white', label: 'White Belt' },
  { color: 'blue', label: 'Blue Belt' },
  { color: 'purple', label: 'Purple Belt' },
  { color: 'brown', label: 'Brown Belt' },
  { color: 'black', label: 'Black Belt' },
];

export default function ThemeSettings() {
  const { toast } = useToast();
  const [selectedBelt, setSelectedBelt] = useState<BeltColor>('blue');
  const [selectedStripes, setSelectedStripes] = useState<number>(0);

  // Fetch current user to get their theme preference
  const { data: user } = useQuery<any>({
    queryKey: ['/api/auth/me'],
  });

  // Update selected belt and stripes when user data loads (in useEffect to prevent render-time state updates)
  useEffect(() => {
    if (user?.themeBelt && selectedBelt !== user.themeBelt) {
      setSelectedBelt(user.themeBelt as BeltColor);
    }
    if (user?.themeStripes !== undefined && selectedStripes !== user.themeStripes) {
      setSelectedStripes(user.themeStripes);
    }
  }, [user?.themeBelt, user?.themeStripes, selectedBelt, selectedStripes]);

  // Mutation to update theme (both belt and stripes)
  const updateThemeMutation = useMutation({
    mutationFn: async ({ belt, stripes }: { belt: BeltColor; stripes: number }) => {
      const response = await apiRequest('PATCH', '/api/user/theme', { 
        themeBelt: belt,
        themeStripes: stripes 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({
        title: "Theme updated",
        description: "Your belt theme has been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update theme",
        variant: "destructive",
      });
    },
  });

  const handleBeltSelect = (belt: BeltColor) => {
    setSelectedBelt(belt);
    updateThemeMutation.mutate({ belt, stripes: selectedStripes });
  };

  const handleStripesSelect = (stripes: number) => {
    setSelectedStripes(stripes);
    updateThemeMutation.mutate({ belt: selectedBelt, stripes });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-semibold mb-2" data-testid="text-page-title">Theme Settings</h1>
          <p className="text-sm text-muted-foreground">
            Choose your current belt and stripe count
          </p>
        </div>

        {/* Belt Selection */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Select Your Belt</h2>
          {BELTS.map((belt) => (
            <div
              key={belt.color}
              onClick={() => handleBeltSelect(belt.color)}
              className="cursor-pointer group"
              data-testid={`belt-option-${belt.color}`}
            >
              {/* Belt Bar - show user's actual stripe count when selected */}
              <div className="mb-2">
                <BeltBar
                  color={belt.color}
                  stripes={selectedBelt === belt.color ? selectedStripes : 0}
                  selected={selectedBelt === belt.color}
                />
              </div>
              
              {/* Radio Button and Label */}
              <div className="flex items-center gap-3 pl-1">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-none ${
                  selectedBelt === belt.color 
                    ? 'border-white bg-white' 
                    : 'border-muted-foreground'
                }`}>
                  {selectedBelt === belt.color && (
                    <div className="w-2 h-2 rounded-full bg-black" />
                  )}
                </div>
                <span className="text-sm font-medium" data-testid={`text-${belt.color}-label`}>
                  {belt.label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Stripe Count Selection */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Number of Stripes</h2>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((stripes) => (
              <Button
                key={stripes}
                variant={selectedStripes === stripes ? "default" : "outline"}
                onClick={() => handleStripesSelect(stripes)}
                data-testid={`button-stripes-${stripes}`}
              >
                {stripes}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Select the number of stripes on your current belt (0-4)
          </p>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          Your selected belt will be used as the primary color theme throughout the app
        </p>
      </div>
    </div>
  );
}
