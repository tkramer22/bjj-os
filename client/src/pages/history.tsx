import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock, User } from "lucide-react";
import { type SmsHistory, type Recipient } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function History() {
  const { data: history, isLoading } = useQuery<SmsHistory[]>({
    queryKey: ["/api/history"],
  });

  const { data: recipients } = useQuery<Recipient[]>({
    queryKey: ["/api/recipients"],
  });

  const getRecipientName = (recipientId: string) => {
    if (!recipients) return "Unknown";
    const recipient = recipients.find((r) => r.id === recipientId);
    return recipient ? recipient.name : "Unknown";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered":
        return "default";
      case "sent":
        return "default";
      case "queued":
        return "secondary";
      case "failed":
      case "undelivered":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "delivered":
        return "✓ Delivered";
      case "sent":
        return "Sent";
      case "queued":
        return "Queued";
      case "failed":
        return "Failed";
      case "undelivered":
        return "Undelivered";
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Message History</h1>
          <p className="text-sm text-muted-foreground">
            View all sent SMS messages
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : history && history.length > 0 ? (
        <div className="space-y-3">
          {history.map((item) => (
            <Card key={item.id} data-testid={`history-item-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm font-medium flex-1" data-testid={`text-message-${item.id}`}>
                        {item.message}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span data-testid={`text-recipient-${item.id}`}>
                          {getRecipientName(item.recipientId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span data-testid={`text-timestamp-${item.id}`}>
                          Sent: {new Date(item.sentAt).toLocaleString()}
                        </span>
                      </div>
                      {item.deliveredAt && (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <Clock className="h-3 w-3" />
                          <span>
                            Delivered: {new Date(item.deliveredAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {item.twilioSid && (
                        <div className="font-mono">
                          SID: {item.twilioSid.slice(0, 20)}...
                        </div>
                      )}
                    </div>
                    {item.errorMessage && (
                      <p className="text-xs text-destructive">
                        Error: {item.errorMessage}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={getStatusColor(item.status) as any}
                    data-testid={`badge-status-${item.id}`}
                  >
                    {getStatusLabel(item.status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="h-16 w-16 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No message history</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Messages sent through your schedules will appear here
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
