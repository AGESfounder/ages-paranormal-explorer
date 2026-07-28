import React, { useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

export default function MultiImageUpload({ label, value = [], onChange }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) {
        const res = await base44.integrations.Core.UploadFile({ file: f });
        urls.push(res.file_url);
      }
      onChange([...(value || []), ...urls]);
    } catch (err) { /* */ }
    setUploading(false);
    e.target.value = '';
  };

  const remove = (i) => onChange((value || []).filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {value && value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((url, i) => (
            <div key={i} className="relative">
              <img src={url} alt="" className="w-full h-20 object-contain rounded-md bg-secondary/30" />
              <button type="button" onClick={() => remove(i)} className="absolute top-1 right-1 bg-black/70 rounded-full p-1">
                <X className="w-3 h-3 text-white" />
              </button>
              {i === 0 && <span className="absolute bottom-1 left-1 text-[8px] bg-primary text-primary-foreground px-1 rounded">Cover</span>}
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary/40 transition-colors">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
        {uploading ? 'Uploading...' : 'Upload picture(s)'}
        <input type="file" accept="image/*" multiple onChange={handleFile} className="hidden" />
      </label>
    </div>
  );
}