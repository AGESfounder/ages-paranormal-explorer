import React, { useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

export default function MediaUpload({ label, accept, value, onChange, type = 'image' }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      onChange(res.file_url);
    } catch (err) { /* */ }
    setUploading(false);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {value && (
        <div className="relative">
          {type === 'image' ? (
            <img src={value} alt="" className="w-full h-40 object-contain rounded-md bg-secondary/30" />
          ) : (
            <video src={value} className="w-full h-40 object-contain rounded-md bg-black" controls />
          )}
          <button type="button" onClick={() => onChange('')} className="absolute top-1 right-1 bg-black/70 rounded-full p-1">
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}
      <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary/40 transition-colors">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
        {uploading ? 'Uploading...' : value ? 'Replace file' : 'Upload file'}
        <input type="file" accept={accept} onChange={handleFile} className="hidden" />
      </label>
    </div>
  );
}