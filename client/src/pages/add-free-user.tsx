import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle2 } from "lucide-react";

const addFreeUserSchema = z.object({
  password: z.string().min(1, "Admin password is required"),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid phone number with country code (e.g., +14155551234)"),
  name: z.string().optional(),
  notes: z.string().optional(),
});

type AddFreeUserForm = z.infer<typeof addFreeUserSchema>;

export default function AddFreeUser() {
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  const form = useForm<AddFreeUserForm>({
    resolver: zodResolver(addFreeUserSchema),
    defaultValues: {
      password: "",
      phoneNumber: "",
      name: "",
      notes: "",
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: AddFreeUserForm) => {
      const response = await apiRequest("POST", "/api/admin/add-free-user", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Free user added and welcome SMS sent.",
      });
      setSuccess(true);
      form.reset();
      setTimeout(() => setSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add free user",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AddFreeUserForm) => {
    addUserMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Add Free User</h1>
        <p className="text-muted-foreground">
          Grant free access to BJJ OS. User will receive welcome SMS and go through onboarding.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
          <CardDescription>
            Enter phone number to create a free user account. They'll receive an immediate welcome SMS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin Password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter admin password"
                        data-testid="input-admin-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="+14155551234"
                        data-testid="input-phone-number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John Doe"
                        data-testid="input-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Friend, influencer, test user, etc."
                        rows={3}
                        data-testid="input-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={addUserMutation.isPending}
                className="w-full"
                data-testid="button-add-free-user"
              >
                {addUserMutation.isPending ? "Adding..." : "Add Free User"}
              </Button>

              {success && (
                <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-md text-green-800 dark:text-green-200">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>User added successfully! Welcome SMS sent.</span>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="mt-8 p-6 bg-muted rounded-lg">
        <h3 className="font-semibold mb-3">What happens next:</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
          <li>User receives welcome SMS with setup instructions</li>
          <li>Onboarding asks: belt level → BJJ style → focus areas</li>
          <li>User gets first technique tomorrow at 8 AM</li>
          <li>Account shows "FREE" status in admin dashboard</li>
          <li>All features enabled (same as paid users)</li>
        </ol>
      </div>
    </div>
  );
}
