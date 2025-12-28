import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Users, MessageSquare, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { type SmsSchedule, type SmsHistory } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const sendTestSMS = async () => {
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: '29884bbb-8cb9-48c0-a084-a202bb7dec7c',
          message: '🥋 Test BJJ technique: Armbar from guard - Keep your knees tight and control the wrist!'
        })
      });
      const data = await response.json();
      alert(data.success ? 'SMS Sent! ✅ Check your phone!' : 'Error: ' + data.error);
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const sendAITechnique = async () => {
    try {
      const response = await fetch('/api/send-technique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: '29884bbb-8cb9-48c0-a084-a202bb7dec7c'
        })
      });
      const data = await response.json();
      
      if (data.success) {
        const topVideo = data.technique.videos[0];
        const smsPreview = `✅ SMS Sent!\n\n🥋 ${data.technique.technique} - ${data.technique.instructor}\n\nKey Detail: ${data.technique.tip}\n\nWatch: ${topVideo?.urlWithTimestamp || 'N/A'}`;
        alert(smsPreview);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const sendToMyPhone = async () => {
    try {
      const response = await fetch('/api/send-to-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: '+19148373750'
        })
      });
      const data = await response.json();
      
      if (data.success) {
        const topVideo = data.technique.videos[0];
        const smsPreview = `✅ SMS Sent to +19148373750!\n\n🥋 ${data.technique.technique} - ${data.technique.instructor}\n\nKey Detail: ${data.technique.tip}\n\nWatch: ${topVideo?.urlWithTimestamp || 'N/A'}`;
        alert(smsPreview);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const testTriangleChoke = async () => {
    try {
      const response = await fetch('/api/generate-technique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technique: 'triangle choke',
          belt_level: 'blue',
          style: 'gi'
        })
      });
      const data = await response.json();
      
      if (data.success) {
        const topVideo = data.technique.videos[0];
        
        // Show SMS format preview + additional details
        const result = `✅ Triangle Choke Generated!\n\n` +
          `SMS Format:\n` +
          `🥋 ${data.technique.technique} - ${data.technique.instructor}\n\n` +
          `Key Detail: ${data.technique.tip}\n\n` +
          `Watch: ${topVideo?.urlWithTimestamp || 'N/A'}\n\n` +
          `───────────────\n` +
          `Video Quality: ${topVideo?.score || 0}/10\n` +
          `Why? ${topVideo?.summary || 'N/A'}`;
        
        console.log('Full technique data:', data.technique);
        alert(result);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalSent: number;
    totalScheduled: number;
    successRate: number;
    totalFailed: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const { data: recentHistory, isLoading: historyLoading } = useQuery<SmsHistory[]>({
    queryKey: ["/api/history"],
    refetchInterval: 3000, // Auto-refresh every 3 seconds to see status updates
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery<SmsSchedule[]>({
    queryKey: ["/api/schedules"],
  });

  const statCards = [
    {
      title: "Total Sent",
      value: stats?.totalSent || 0,
      icon: MessageSquare,
      color: "text-chart-1",
      testId: "stat-total-sent",
    },
    {
      title: "Active Schedules",
      value: stats?.totalScheduled || 0,
      icon: Calendar,
      color: "text-chart-3",
      testId: "stat-active-schedules",
    },
    {
      title: "Success Rate",
      value: `${stats?.successRate.toFixed(1) || 0}%`,
      icon: TrendingUp,
      color: "text-chart-2",
      testId: "stat-success-rate",
    },
    {
      title: "Failed",
      value: stats?.totalFailed || 0,
      icon: MessageSquare,
      color: "text-chart-4",
      testId: "stat-failed",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Test SMS Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>🧪 Test SMS</CardTitle>
            <CardDescription>Send a static test message</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={sendTestSMS} variant="default" data-testid="button-send-test-sms">
              📱 Send Test SMS
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🤖 AI Technique</CardTitle>
            <CardDescription>Send AI-generated BJJ technique</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={sendAITechnique} 
              variant="default" 
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-send-ai-technique"
            >
              🥋 Send AI Technique
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📲 Send to My Phone</CardTitle>
            <CardDescription>Text to +19148373750</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={sendToMyPhone} 
              variant="default" 
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-send-to-my-phone"
            >
              📱 Send to My Phone
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🔺 Triangle Choke Test</CardTitle>
            <CardDescription>Blue belt, gi, with curated videos</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={testTriangleChoke} 
              variant="default" 
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-test-triangle-choke"
            >
              🎯 Generate Triangle
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overview of your SMS campaigns
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/recipients">
            <Button variant="outline" data-testid="button-add-recipient">
              <Users className="mr-2 h-4 w-4" />
              Add Recipient
            </Button>
          </Link>
          <Link href="/schedules">
            <Button data-testid="button-new-schedule">
              <Plus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-semibold" data-testid={stat.testId}>
                  {stat.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest SMS delivery status</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentHistory && recentHistory.length > 0 ? (
              <div className="space-y-3">
                {recentHistory.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                    data-testid={`history-item-${item.id}`}
                  >
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium line-clamp-1">
                        {item.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.sentAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.status === "delivered"
                          ? "default"
                          : item.status === "sent"
                          ? "secondary"
                          : item.status === "failed" || item.status === "undelivered"
                          ? "destructive"
                          : "outline"
                      }
                      data-testid={`badge-status-${item.status}`}
                    >
                      {item.status === "delivered" && "✓ Delivered"}
                      {item.status === "sent" && "→ Sent"}
                      {item.status === "queued" && "⋯ Queued"}
                      {item.status === "failed" && "✕ Failed"}
                      {item.status === "undelivered" && "✕ Undelivered"}
                      {!["delivered", "sent", "queued", "failed", "undelivered"].includes(item.status) && item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No messages sent yet
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Schedules</CardTitle>
            <CardDescription>Currently running SMS schedules</CardDescription>
          </CardHeader>
          <CardContent>
            {schedulesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : schedules && schedules.filter(s => s.active).length > 0 ? (
              <div className="space-y-3">
                {schedules
                  .filter(s => s.active)
                  .slice(0, 3)
                  .map((schedule) => (
                    <div
                      key={schedule.id}
                      className="rounded-md border border-border p-3 space-y-2"
                      data-testid={`schedule-item-${schedule.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-2 flex-1">
                          {schedule.message}
                        </p>
                        <Badge variant="outline" className="shrink-0">
                          {schedule.scheduleTime}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{schedule.recipientIds.length} recipients</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No active schedules
                </p>
                <Link href="/schedules">
                  <Button variant="outline" size="sm" className="mt-3">
                    Create Schedule
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
