import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApiRequest } from "@/lib/adminApi";
import { AdminLayout } from "./dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, Link2, TrendingUp, Target, Zap, Check } from "lucide-react";

type TechniqueChain = {
  id: number;
  name: string;
  description: string;
  chainType: string;
  steps: any[];
  stepCount: number;
  positionStart: string;
  positionEnd: string;
  primaryCategory: string;
  difficultyLevel: string;
  minBeltLevel: string;
  giPreference: string;
  requiresAthleticism: boolean;
  requiresFlexibility: boolean;
  technicalVsAthletic: string;
  timesRecommended: number;
  timesSaved: number;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulRatio: string | null;
  createdAt: string;
};

type ChainStats = {
  totalChains: number;
  totalSaved: number;
  totalFeedback: number;
  topChains: TechniqueChain[];
};

export default function AdminChains() {
  const [selectedChain, setSelectedChain] = useState<TechniqueChain | null>(null);
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch chain stats with authentication
  const { data: stats } = useQuery<ChainStats>({
    queryKey: ["/api/admin/chains/stats"],
    queryFn: () => adminApiRequest("/api/admin/chains/stats"),
  });

  // Fetch all chains with authentication
  const { data: chains = [], isLoading } = useQuery<TechniqueChain[]>({
    queryKey: ["/api/chains", positionFilter, difficultyFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (positionFilter !== "all") params.append("position", positionFilter);
      if (difficultyFilter !== "all") params.append("difficulty", difficultyFilter);
      if (categoryFilter !== "all") params.append("category", categoryFilter);
      
      return adminApiRequest(`/api/chains?${params}`);
    },
  });

  const filteredChains = chains.filter(chain => 
    chain.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chain.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getBeltBadgeVariant = (belt: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      white: "outline",
      blue: "default",
      purple: "default",
      brown: "secondary",
      black: "secondary",
    };
    return variants[belt] || "outline";
  };

  const getDifficultyBadgeVariant = (difficulty: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      beginner: "outline",
      intermediate: "default",
      advanced: "secondary",
    };
    return variants[difficulty] || "outline";
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Technique Chains</h1>
          <p className="text-muted-foreground">Manage pre-built BJJ technique sequences</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chains</CardTitle>
            <Link2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-chains">{stats?.totalChains || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saved</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-saved">{stats?.totalSaved || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-feedback">{stats?.totalFeedback || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Chain Saves</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-top-saves">
              {stats?.topChains?.[0]?.timesSaved || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Input
              placeholder="Search chains..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-chains"
            />
            
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger data-testid="select-position-filter">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-option-all-positions">All Positions</SelectItem>
                <SelectItem value="closed_guard" data-testid="select-option-closed-guard">Closed Guard</SelectItem>
                <SelectItem value="mount" data-testid="select-option-mount">Mount</SelectItem>
                <SelectItem value="back_control" data-testid="select-option-back-control">Back Control</SelectItem>
                <SelectItem value="side_control" data-testid="select-option-side-control">Side Control</SelectItem>
                <SelectItem value="half_guard" data-testid="select-option-half-guard">Half Guard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger data-testid="select-difficulty-filter">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-option-all-difficulty">All Levels</SelectItem>
                <SelectItem value="beginner" data-testid="select-option-beginner">Beginner</SelectItem>
                <SelectItem value="intermediate" data-testid="select-option-intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced" data-testid="select-option-advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger data-testid="select-category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-option-all-category">All Categories</SelectItem>
                <SelectItem value="submissions" data-testid="select-option-submissions">Submissions</SelectItem>
                <SelectItem value="sweeps" data-testid="select-option-sweeps">Sweeps</SelectItem>
                <SelectItem value="passing" data-testid="select-option-passing">Passing</SelectItem>
                <SelectItem value="escapes" data-testid="select-option-escapes">Escapes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Chains List */}
      <Card>
        <CardHeader>
          <CardTitle>All Chains ({filteredChains.length})</CardTitle>
          <CardDescription>Click on a chain to view details</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading chains...</div>
          ) : (
            <div className="space-y-2">
              {filteredChains.map((chain) => (
                <div
                  key={chain.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover-elevate cursor-pointer"
                  onClick={() => setSelectedChain(chain)}
                  data-testid={`chain-item-${chain.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold" data-testid={`text-chain-name-${chain.id}`}>{chain.name}</h3>
                      <Badge variant={getBeltBadgeVariant(chain.minBeltLevel)} data-testid={`badge-belt-${chain.id}`}>
                        {chain.minBeltLevel}
                      </Badge>
                      <Badge variant={getDifficultyBadgeVariant(chain.difficultyLevel)} data-testid={`badge-difficulty-${chain.id}`}>
                        {chain.difficultyLevel}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1" data-testid={`text-chain-description-${chain.id}`}>
                      {chain.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span data-testid={`text-step-count-${chain.id}`}>{chain.stepCount} steps</span>
                      <span>•</span>
                      <span data-testid={`text-category-${chain.id}`}>{chain.primaryCategory}</span>
                      <span>•</span>
                      <span data-testid={`text-position-flow-${chain.id}`}>{chain.positionStart} → {chain.positionEnd}</span>
                      <span>•</span>
                      <span data-testid={`text-saves-${chain.id}`}>{chain.timesSaved} saves</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" data-testid={`icon-chevron-${chain.id}`} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chain Detail Dialog */}
      <Dialog open={selectedChain !== null} onOpenChange={(open) => !open && setSelectedChain(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="dialog-chain-detail">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-chain-name">{selectedChain?.name}</DialogTitle>
            <DialogDescription data-testid="text-dialog-chain-description">{selectedChain?.description}</DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[500px] pr-4">
            {selectedChain && (
              <div className="space-y-6">
                {/* Chain Metadata */}
                <div className="flex flex-wrap gap-2" data-testid="section-chain-metadata">
                  <Badge variant={getBeltBadgeVariant(selectedChain.minBeltLevel)} data-testid="badge-dialog-belt">
                    {selectedChain.minBeltLevel} belt
                  </Badge>
                  <Badge variant={getDifficultyBadgeVariant(selectedChain.difficultyLevel)} data-testid="badge-dialog-difficulty">
                    {selectedChain.difficultyLevel}
                  </Badge>
                  <Badge variant="outline" data-testid="badge-dialog-category">{selectedChain.primaryCategory}</Badge>
                  <Badge variant="outline" data-testid="badge-dialog-gi-preference">{selectedChain.giPreference}</Badge>
                  <Badge variant="outline" data-testid="badge-dialog-technical">{selectedChain.technicalVsAthletic}</Badge>
                  {selectedChain.requiresAthleticism && (
                    <Badge variant="outline" data-testid="badge-dialog-athleticism">Requires Athleticism</Badge>
                  )}
                  {selectedChain.requiresFlexibility && (
                    <Badge variant="outline" data-testid="badge-dialog-flexibility">Requires Flexibility</Badge>
                  )}
                </div>

                <Separator />

                {/* Chain Steps */}
                <div className="space-y-4" data-testid="section-chain-steps">
                  <h3 className="font-semibold text-lg">Technique Steps</h3>
                  {selectedChain.steps.map((step: any, index: number) => (
                    <Card key={index} data-testid={`card-step-${index}`}>
                      <CardHeader>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground" data-testid={`badge-step-number-${index}`}>
                            {step.step}
                          </div>
                          <CardTitle className="text-base" data-testid={`text-step-name-${index}`}>{step.name}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm" data-testid={`text-step-description-${index}`}>{step.description}</p>
                        
                        {step.key_points && step.key_points.length > 0 && (
                          <div data-testid={`section-key-points-${index}`}>
                            <p className="text-sm font-medium mb-2">Key Points:</p>
                            <ul className="space-y-1">
                              {step.key_points.map((point: string, i: number) => (
                                <li key={i} className="text-sm flex items-start gap-2" data-testid={`text-key-point-${index}-${i}`}>
                                  <Check className="h-4 w-4 text-green-500 dark:text-green-400 mt-0.5" />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {step.technique_search && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-technique-search-${index}`}>
                            Search: {step.technique_search}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                {/* Chain Stats */}
                <div className="grid grid-cols-2 gap-4" data-testid="section-chain-analytics">
                  <div>
                    <p className="text-sm text-muted-foreground">Times Recommended</p>
                    <p className="text-2xl font-bold" data-testid="stat-dialog-recommended">{selectedChain.timesRecommended}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Times Saved</p>
                    <p className="text-2xl font-bold" data-testid="stat-dialog-saved">{selectedChain.timesSaved}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Helpful Votes</p>
                    <p className="text-2xl font-bold" data-testid="stat-dialog-helpful">{selectedChain.helpfulCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Not Helpful Votes</p>
                    <p className="text-2xl font-bold" data-testid="stat-dialog-not-helpful">{selectedChain.notHelpfulCount}</p>
                  </div>
                </div>

                <Separator />

                {/* Helpful Ratio */}
                <div data-testid="section-helpful-ratio">
                  <p className="text-sm text-muted-foreground mb-2">Helpful Ratio</p>
                  <div className="flex items-center gap-4">
                    <p className="text-3xl font-bold" data-testid="stat-dialog-ratio">
                      {selectedChain.helpfulRatio ? `${parseFloat(selectedChain.helpfulRatio).toFixed(1)}%` : "N/A"}
                    </p>
                    {selectedChain.helpfulRatio && parseFloat(selectedChain.helpfulRatio) >= 80 && (
                      <Badge variant="default" data-testid="badge-highly-rated">Highly Rated</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}
