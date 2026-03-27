import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReportFileUploadProps {
  onFilesSelect: (files: File[]) => void;
  selectedFiles: File[];
  onRemoveFile: (index: number) => void;
  onClear: () => void;
  isLoading?: boolean;
}

export function ReportFileUpload({ onFilesSelect, selectedFiles, onRemoveFile, onClear, isLoading }: ReportFileUploadProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) onFilesSelect(acceptedFiles);
  }, [onFilesSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: true,
    disabled: isLoading,
  });

  return (
    <div className="space-y-3">
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveFile(index); }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                disabled={isLoading}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        {...getRootProps()}
        className={cn(
          'relative cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-all duration-200',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50',
          isLoading && 'pointer-events-none opacity-50'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-full transition-colors', isDragActive ? 'bg-primary/10' : 'bg-muted')}>
            {selectedFiles.length > 0 ? (
              <Plus className={cn('h-5 w-5 transition-colors', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
            ) : (
              <Upload className={cn('h-5 w-5 transition-colors', isDragActive ? 'text-primary' : 'text-muted-foreground')} />
            )}
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">
              {isDragActive ? 'Solte os arquivos aqui' : selectedFiles.length > 0 ? 'Adicionar mais arquivos' : 'Arraste arquivos ou clique para selecionar'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedFiles.length > 0 ? 'Os dados serão combinados automaticamente' : 'Formatos: XLSX, XLS, CSV • Múltiplos arquivos permitidos'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
