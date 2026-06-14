import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Ghost, MapPin, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { US_STATES } from '../lib/statesData';

export default function CustomTourModal({ isOpen, onClose }) {
  const [destination, setDestination] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGenerate = async () => {
    const dest = destination.trim();
    if (!dest || !state) {
      setError('Please fill in both fields.');
      return;
    }
    const st = state;
    setError('');
    setLoading(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a paranormal ghost hunting tour for the haunted destination "${dest}" in ${st}.

This is a SINGLE DESTINATION tour — ALL stops must be specific areas, rooms, buildings, wings, features, or sections within or on the grounds of "${dest}". Do NOT create stops that are separate, unaffiliated locations.

Examples of valid stops (for a destination like Pennhurst Asylum): Administration Building, Devon Building, Quaker Building, Tunnels, Patient Wards, Basement, Infirmary, Morgue, Museum, Exterior Grounds. Every stop belongs to the same destination.

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible.

2. WALKING TOURS (preferred for single destinations): Stops form a logical loop — start and end near the entrance/main building. Route proceeds in an efficient circle so investigators return to their starting point. Every stop ≤0.33 miles from the previous.

3. PUBLIC ACCESS AFTER 7 PM: ALL stops must be accessible after 7 PM — at minimum, investigators must be able to be outside each building/area after 7 PM. Note any interior access restrictions in hours_of_operation. Include entry fees and ticket pricing in entry_fee.

4. MOST POPULAR STOPS: Prioritize the most famous, most talked-about areas of "${dest}" — the locations where paranormal activity and ghosts have been observed and recorded most. Include stops that are widely discussed in paranormal circles.

Return a JSON object with:
- title: "${dest} Paranormal Investigation"
- state: "${st}"
- city: the city where "${dest}" is located
- tour_type: "walking" (use "walking" unless the destination is extremely spread out)
- description: 2-3 sentences about the destination's haunted history
- introduction: 3-4 sentences setting the scene for investigators
- conclusion: 2-3 sentences wrapping up the investigation
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "~0.8 miles"
- start_location_name: the main entrance or parking area
- start_latitude: number (use real coordinates for "${dest}")
- start_longitude: number (use real coordinates for "${dest}")
- image_url: empty string
- tags: array of 3-5 relevant strings
- safety_info: 2-3 practical safety notes for this specific location
- best_time: best season/time for investigating

PLUS a "stops" array (7-12 stops) — each with:
- stop_number: starting from 1
- name: specific area/building/room name within "${dest}"
- latitude: real coordinates (number)
- longitude: real coordinates (number)
- address: street address of "${dest}" (same for all stops since it's one destination — use "${dest}" full address)
- historical_info: 2-3 sentences of the specific area's history
- paranormal_info: 2-3 sentences about paranormal activity reported in that specific area
- investigation_suggestions: 3-4 specific suggestions for investigating that area
- estimated_investigation_time: e.g. "20-30 minutes"
- construction_date: when that area was built if known
- famous_people: notable people associated with that area
- image_url: empty string
- narration_text: 2-3 sentences of evocative narration for audio guides
- travel_method: "walking"
- hours_of_operation: e.g. "Exterior accessible 24/7, interior tours until 10PM Friday-Saturday"
- entry_fee: e.g. "$25 for day tour, $45 for overnight investigation"

Use real locations and real paranormal history for "${dest}". Verify hours, pricing, and after-7PM accessibility. Make every stop feel distinct and worth visiting.`,

        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            state: { type: "string" },
            city: { type: "string" },
            tour_type: { type: "string", enum: ["walking", "driving", "mixed"] },
            description: { type: "string" },
            introduction: { type: "string" },
            conclusion: { type: "string" },
            difficulty: { type: "string", enum: ["easy", "moderate", "challenging"] },
            estimated_duration: { type: "string" },
            total_distance: { type: "string" },
            start_location_name: { type: "string" },
            start_latitude: { type: "number" },
            start_longitude: { type: "number" },
            image_url: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            safety_info: { type: "string" },
            best_time: { type: "string" },
            stops: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  stop_number: { type: "number" },
                  name: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  address: { type: "string" },
                  historical_info: { type: "string" },
                  paranormal_info: { type: "string" },
                  investigation_suggestions: { type: "array", items: { type: "string" } },
                  estimated_investigation_time: { type: "string" },
                  construction_date: { type: "string" },
                  famous_people: { type: "string" },
                  image_url: { type: "string" },
                  narration_text: { type: "string" },
                  travel_method: { type: "string", enum: ["walking", "driving"] },
                  hours_of_operation: { type: "string" },
                  entry_fee: { type: "string" },
                },
                required: ["stop_number", "name", "latitude", "longitude", "address"],
              }
            }
          },
          required: ["title", "state", "city", "tour_type", "stops"],
        },
        model: "gemini_3_flash",
        add_context_from_internet: true,
      });

      // Create the tour
      const tourData = {
        title: result.title,
        state: st,
        city: result.city,
        tour_type: result.tour_type,
        description: result.description,
        introduction: result.introduction,
        conclusion: result.conclusion,
        difficulty: result.difficulty,
        estimated_duration: result.estimated_duration,
        total_distance: result.total_distance,
        start_location_name: result.start_location_name,
        start_latitude: result.start_latitude,
        start_longitude: result.start_longitude,
        image_url: result.image_url || '',
        tags: result.tags || [],
        safety_info: result.safety_info || '',
        best_time: result.best_time || '',
      };

      const newTour = await base44.entities.Tour.create(tourData);

      // Create all stops
      if (result.stops?.length > 0) {
        const stopRecords = result.stops.map((s) => ({
          tour_id: newTour.id,
          stop_number: s.stop_number,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          address: s.address,
          historical_info: s.historical_info || '',
          paranormal_info: s.paranormal_info || '',
          investigation_suggestions: s.investigation_suggestions || [],
          estimated_investigation_time: s.estimated_investigation_time || '',
          construction_date: s.construction_date || '',
          famous_people: s.famous_people || '',
          image_url: s.image_url || '',
          narration_text: s.narration_text || '',
          travel_method: s.travel_method || 'walking',
          hours_of_operation: s.hours_of_operation || '',
          entry_fee: s.entry_fee || '',
        }));
        await base44.entities.TourStop.bulkCreate(stopRecords);
      }

      onClose();
      setDestination('');
      setState('');
      navigate(`/tour/${newTour.id}`);
    } catch (err) {
      console.error('Custom tour generation failed', err);
      setError('Failed to generate tour. Please try again.');
    }
    setLoading(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
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
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-lg bg-primary/10">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">Custom Tour</h2>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">Haunted Destinations</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Haunted Destination
                </label>
                <div className="relative">
                  <Ghost className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. Pennhurst Asylum"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  State
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <select
                    value={state}
                    onChange={e => setState(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="" disabled className="bg-card text-muted-foreground">Select a state...</option>
                    {US_STATES.map(s => (
                      <option key={s.abbr} value={s.name} className="bg-card text-foreground">{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-[0_0_20px_hsl(199,89%,48%,0.2)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Your Tour...
                  </>
                ) : (
                  <>
                    <Ghost className="w-4 h-4" />
                    Generate Custom Tour
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/60 text-center">
                Creates a destination-focused tour with stops at specific areas, rooms, and features within the location.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}