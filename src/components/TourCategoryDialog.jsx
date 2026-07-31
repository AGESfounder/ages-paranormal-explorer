import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Ghost } from 'lucide-react';
import TourCategoryPicker from './TourCategoryPicker';
import AccessTypePicker from './AccessTypePicker';

export default function TourCategoryDialog({ isOpen, onClose, onSelect, destination }) {
  const [category, setCategory] = useState('');
  const [accessType, setAccessType] = useState('exterior_interior');

  useEffect(() => {
    if (!isOpen) { setCategory(''); setAccessType('exterior_interior'); }
  }, [isOpen]);

  const handleGenerate = () => {
    if (!category) return;
    onSelect(category, accessType);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full sm:w-[420px] max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 mx-0 sm:mx-4"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Ghost className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">Select Tour Type</h2>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider truncate max-w-[200px]">{destination}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Choose the type of paranormal tour you'd like to create for this destination.
            </p>

            <TourCategoryPicker value={category} onChange={setCategory} />

            {(category === 'cold_spot' || category === 'landmark') && (
              <>
                <p className="text-xs text-muted-foreground mt-3 mb-2 leading-relaxed">Choose access type for this property:</p>
                <AccessTypePicker value={accessType} onChange={setAccessType} />
              </>
            )}

            <button
              onClick={handleGenerate}
              disabled={!category}
              className="w-full flex items-center justify-center gap-2 py-3 mt-4 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-[0_0_20px_hsl(199,89%,48%,0.2)]"
            >
              <Ghost className="w-4 h-4" />
              Generate Tour
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}