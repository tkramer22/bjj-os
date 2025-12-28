import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Award, 
  Youtube, 
  BookOpen, 
  Star, 
  RefreshCw, 
  Loader2, 
  TrendingUp,
  Calculator,
  Edit,
  Save,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import { formatDistanceToNow } from "date-fns";

interface InstructorPriority {
  id: string;
  instructorId: number;
  instructorName: string;
  priorityScore: number;
  isManualOverride: boolean;
  manualScore: number | null;
  youtubeScore: number;
  achievementScore: number;
  instructionalScore: number;
  feedbackScore: number;
  lastCalculated: string;
  subscriberCount: number | null;
  achievements: string[];
  instructionalCount: number;
}

interface InstructorDetails {
  priorityScore: number;
  isManualOverride: boolean;
  breakdown: {
    youtube: { score: number; maxScore: 30; details: string };
    achievements: { score: number; maxScore: 25; details: string };
    instructionals: { score: number; maxScore: 20; details: string };
    feedback: { score: number; maxScore: 25; details: string };
  };
  lastCalculated: string;
}

export default function AdminInstructorPriority() {
  const { toast } = useToast();
  const [selectedInstructor, setSelectedInstructor] = useState<InstructorPriority | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [manualScore, setManualScore] = useState<string>("");

  const { data: instructors, isLoading, error: instructorsError } = useQuery({
    queryKey: ['/api/admin/instructors/priority/list'],
    queryFn: () => adminApiRequest('/api/admin/instructors/priority/list'),
  });

  const { data: instructorDetails } = useQuery({
    queryKey: ['/api/admin/instructors/priority/details', selectedInstructor?.instructorId],
    queryFn: () => adminApiRequest(`/api/admin/instructors/priority/${selectedInstructor?.instructorId}`),
    enabled: !!selectedInstructor && showDetails,
  });

  const recalculateMutation = useMutation({
    mutationFn: async (instructorId?: number) => {
      const endpoint = instructorId 
        ? `/api/admin/instructors/priority/recalculate/${instructorId}`
        : '/api/admin/instructors/priority/recalculate';
      return await adminApiRequest(endpoint, 'POST', {});
    },
    onSuccess: (data, instructorId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors/priority/list'] });
      if (instructorId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors/priority/details', instructorId] });
      }
      toast({
        title: "✅ Priority Recalculated",
        description: instructorId 
          ? "Instructor priority updated successfully"
          : `Recalculated priority for ${data.recalculated || 0} instructors`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to recalculate priority",
        variant: "destructive",
      });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ instructorId, score }: { instructorId: number; score: number }) => {
      return await adminApiRequest(`/api/admin/instructors/priority/override/${instructorId}`, 'POST', { manualScore: score });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors/priority/list'] });
      if (selectedInstructor) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/instructors/priority/details', selectedInstructor.instructorId] });
      }
      toast({
        title: "✅ Manual Override Set",
        description: "Instructor priority manually overridden",
      });
      setIsEditing(false);
      setManualScore("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set manual override",
        variant: "destructive",
      });
    },
  });

  const viewDetails = (instructor: InstructorPriority) => {
    setSelectedInstructor(instructor);
    setShowDetails(true);
    setIsEditing(false);
    setManualScore("");
  };

  const handleSetManualOverride = () => {
    if (!selectedInstructor || !manualScore) return;
    const score = parseFloat(manualScore);
    if (isNaN(score) || score < 0 || score > 100) {
      toast({
        title: "Invalid Score",
        description: "Priority score must be between 0 and 100",
        variant: "destructive",
      });
      return;
    }
    overrideMutation.mutate({ instructorId: selectedInstructor.instructorId, score });
  };

  const getPriorityBadgeColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (score >= 60) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    if (score >= 40) return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    return 'bg-red-500/10 text-red-500 border-red-500/20';
  };

  const sortedInstructors = instructors 
    ? [...instructors].sort((a: InstructorPriority, b: InstructorPriority) => b.priorityScore - a.priorityScore)
    : [];

  return (
    <AdminLayout title="Instructor Priority Management">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Instructor Priority Scores</h2>
            <p className="text-muted-foreground">
              Auto-calculated scores based on YouTube subs, achievements, instructionals, and user feedback
            </p>
          </div>
          <Button
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
            data-testid="button-recalculate-all"
          >
            {recalculateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalculate All
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Instructors</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-instructors">
                {instructors?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">High Priority</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500" data-testid="text-high-priority-count">
                {instructors?.filter((i: InstructorPriority) => i.priorityScore >= 80).length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Score ≥ 80</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Manual Overrides</CardTitle>
              <Edit className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500" data-testid="text-manual-override-count">
                {instructors?.filter((i: InstructorPriority) => i.isManualOverride).length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Priority</CardTitle>
              <Calculator className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-avg-priority">
                {instructors?.length 
                  ? (instructors.reduce((sum: number, i: InstructorPriority) => sum + i.priorityScore, 0) / instructors.length).toFixed(1)
                  : '0.0'}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Instructor Rankings</CardTitle>
            <CardDescription>
              Priority formula: YouTube (30pts) + Achievements (25pts) + Instructionals (20pts) + Feedback (25pts) = 100pts max
            </CardDescription>
          </CardHeader>
          <CardContent>
            {instructorsError ? (
              <div className="text-center py-8" data-testid="error-instructors">
                <XCircle className="h-12 w-12 mx-auto mb-2 text-red-500" />
                <p className="text-red-500 font-medium">Failed to load instructor data</p>
                <p className="text-sm text-muted-foreground mt-1">{(instructorsError as Error).message}</p>
              </div>
            ) : isLoading ? (
              <div className="flex justify-center py-8" data-testid="loading-instructors">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sortedInstructors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-instructors">
                No instructors found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Priority Score</TableHead>
                    <TableHead>YouTube</TableHead>
                    <TableHead>Achievements</TableHead>
                    <TableHead>Instructionals</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedInstructors.map((instructor: InstructorPriority, index: number) => (
                    <TableRow key={instructor.id} data-testid={`row-instructor-${instructor.instructorId}`}>
                      <TableCell className="font-medium">#{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{instructor.instructorName}</span>
                          {instructor.isManualOverride && (
                            <Badge variant="outline" className="text-xs">
                              <Edit className="h-3 w-3 mr-1" />
                              Manual
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityBadgeColor(instructor.priorityScore)} data-testid={`badge-priority-${instructor.instructorId}`}>
                          {instructor.priorityScore.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Youtube className="h-3 w-3 text-red-500" />
                          <span>{instructor.youtubeScore.toFixed(1)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Award className="h-3 w-3 text-yellow-500" />
                          <span>{instructor.achievementScore.toFixed(1)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <BookOpen className="h-3 w-3 text-blue-500" />
                          <span>{instructor.instructionalScore.toFixed(1)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-3 w-3 text-purple-500" />
                          <span>{instructor.feedbackScore.toFixed(1)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(instructor.lastCalculated), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewDetails(instructor)}
                            data-testid={`button-view-details-${instructor.instructorId}`}
                          >
                            View Details
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => recalculateMutation.mutate(instructor.instructorId)}
                            disabled={recalculateMutation.isPending}
                            data-testid={`button-recalculate-${instructor.instructorId}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedInstructor?.instructorName} - Priority Breakdown
              </DialogTitle>
              <DialogDescription>
                Detailed calculation of instructor priority score
              </DialogDescription>
            </DialogHeader>

            {instructorDetails && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Total Priority Score</CardTitle>
                      <Badge className={getPriorityBadgeColor(instructorDetails.priorityScore)}>
                        {instructorDetails.priorityScore.toFixed(1)} / 100
                      </Badge>
                    </div>
                    {instructorDetails.isManualOverride && (
                      <CardDescription className="text-blue-500">
                        ⚠️ Manual override active
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>

                <div className="space-y-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Youtube className="h-4 w-4 text-red-500" />
                          <span className="font-medium">YouTube Subscribers</span>
                        </div>
                        <span className="font-bold">{instructorDetails.breakdown.youtube.score} / {instructorDetails.breakdown.youtube.maxScore}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{instructorDetails.breakdown.youtube.details}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">Achievements</span>
                        </div>
                        <span className="font-bold">{instructorDetails.breakdown.achievements.score} / {instructorDetails.breakdown.achievements.maxScore}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{instructorDetails.breakdown.achievements.details}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">Instructionals</span>
                        </div>
                        <span className="font-bold">{instructorDetails.breakdown.instructionals.score} / {instructorDetails.breakdown.instructionals.maxScore}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{instructorDetails.breakdown.instructionals.details}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-purple-500" />
                          <span className="font-medium">User Feedback</span>
                        </div>
                        <span className="font-bold">{instructorDetails.breakdown.feedback.score} / {instructorDetails.breakdown.feedback.maxScore}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{instructorDetails.breakdown.feedback.details}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Manual Override</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="manual-score">Priority Score (0-100)</Label>
                          <Input
                            id="manual-score"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={manualScore}
                            onChange={(e) => setManualScore(e.target.value)}
                            placeholder="Enter manual priority score"
                            data-testid="input-manual-score"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSetManualOverride}
                            disabled={overrideMutation.isPending}
                            data-testid="button-save-manual-override"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save Override
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsEditing(false);
                              setManualScore("");
                            }}
                            data-testid="button-cancel-manual-override"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        data-testid="button-edit-manual-override"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Set Manual Override
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
