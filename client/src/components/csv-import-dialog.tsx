import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (csvData: string) => {
      const response = await apiRequest("POST", "/api/recipients/import", { csvData });
      return response.json() as Promise<ImportResult>;
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/recipients"] });
      
      if (result.success > 0) {
        toast({
          title: "Import completed",
          description: `Successfully imported ${result.success} recipient${result.success !== 1 ? 's' : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}.`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Import failed",
        description: "Failed to import recipients. Please check your CSV format.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          title: "Invalid file",
          description: "Please select a CSV file",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      await importMutation.mutateAsync(csvData);
    };
    reader.readAsText(file);
  };

  const handleClose = () => {
    setFile(null);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import Recipients from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: name, phone, group (optional)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <div className="flex gap-2">
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                data-testid="input-csv-file"
              />
            </div>
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{file.name}</span>
              </div>
            )}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>CSV Format:</strong> name,phone,group (header row required)
              <br />
              Example: John Doe,+12345678901,VIP
            </AlertDescription>
          </Alert>

          {importResult && (
            <Alert variant={importResult.failed > 0 ? "destructive" : "default"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <strong>Import Results:</strong>
                <br />
                ✓ Successfully imported: {importResult.success}
                {importResult.failed > 0 && (
                  <>
                    <br />
                    ✗ Failed: {importResult.failed}
                  </>
                )}
                {importResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {importResult.errors.slice(0, 5).map((error, i) => (
                      <div key={i} className="text-xs">• {error}</div>
                    ))}
                    {importResult.errors.length > 5 && (
                      <div className="text-xs">
                        ... and {importResult.errors.length - 5} more errors
                      </div>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel"
          >
            {importResult ? "Close" : "Cancel"}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={!file || importMutation.isPending}
              data-testid="button-import"
            >
              {importMutation.isPending ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
