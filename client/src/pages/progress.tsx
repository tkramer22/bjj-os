import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BeltIcon } from "@/components/BeltIcon";
import { Calendar, TrendingUp, Flame } from "lucide-react";
import { format } from "date-fns";
import UserLayout from "@/components/layouts/UserLayout";

export default function ProgressPage() {
  const { data: user, isLoading } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  if (isLoading) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-2xl">Loading...</div>
        </div>
      </UserLayout>
    );
  }

  if (!user) {
    return (
      <UserLayout>
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-xl text-muted-foreground">Please log in to view your progress</div>
        </div>
      </UserLayout>
    );
  }

  const memberSince = user.createdAt ? format(new Date(user.createdAt), 'MMMM d, yyyy') : 'Unknown';
  const totalLogins = user.totalLogins || 0;
  const currentStreak = user.currentStreak || 0;
  const beltLevel = user.beltLevel || 'blue';

  return (
    <UserLayout>
      <div className="w-full h-full p-6 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header with Belt */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Your Progress</h1>
          <div className="flex justify-center">
            <BeltIcon rank={beltLevel as any} size="large" />
          </div>
          <p className="text-muted-foreground text-lg">
            {beltLevel.charAt(0).toUpperCase() + beltLevel.slice(1)} Belt
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Member Since */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Since</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memberSince}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Your journey began
              </p>
            </CardContent>
          </Card>

          {/* Total Logins */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Logins</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalLogins}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Training sessions
              </p>
            </CardContent>
          </Card>

          {/* Current Streak */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
              <Flame className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currentStreak}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentStreak === 1 ? 'day' : 'days'} in a row
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Training Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Training Style:</span>
              <span className="font-medium capitalize">{user.style || 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Training Frequency:</span>
              <span className="font-medium">{user.trainingFrequency || 0} days/week</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subscription:</span>
              <span className="font-medium capitalize">{user.subscriptionType?.replace('_', ' ') || 'Free Trial'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </UserLayout>
  );
}
