import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Globe, Ship, Ghost } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';

export default function ToursAbroadModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [destinationName, setDestinationName] = useState('');
  const [location, setLocation] = useState('');
  const [locationType, setLocationType] = useState('');
  const [stopCount, setStopCount] = useState('5-7');
  const [specifics, setSpecifics] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    const dest = destinationName.trim();
    const loc = location.trim();
    const locType = locationType.trim();
    if (!dest || !loc || !locType) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a paranormal ghost hunting tour for "${dest}" located in ${loc}, type: ${locType}.${specifics.trim() ? `\n\nSpecific requests: ${specifics.trim()}` : ''}

This is a SINGLE DESTINATION tour — ALL stops must be specific areas, rooms, buildings, wings, features, or sections within or on the grounds of "${dest}". Do NOT create stops that are separate, unaffiliated locations.

Examples of valid stops (for a destination like Edinburgh Castle): Great Hall, St. Margaret's Chapel, Crown Room, Vaults, David's Tower, Mons Meg Battery, Prisons of War, Dog Cemetery, Forecourt. Every stop belongs to the same destination.

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible.

2. WALKING TOURS (preferred for single destinations): Stops form a logical loop — start and end near the entrance/main building. Route proceeds in an efficient circle so investigators return to their starting point.

3. FOR SHIPS/VESSELS: Create a walkthrough of the most haunted decks, cabins, engine rooms, and areas. Stops should follow the natural flow through the ship.

4. PUBLIC ACCESS AFTER 7 PM: ALL stops must be accessible after 7 PM — at minimum, investigators must be able to be outside each building/area after 7 PM. Note any interior access restrictions in hours_of_operation. Include entry fees and ticket pricing in entry_fee.

5. MOST POPULAR STOPS: Prioritize the most famous, most talked-about areas of "${dest}" — the locations where paranormal activity and ghosts have been observed and recorded most.

Return a JSON object with:
- title: "${dest} Paranormal Investigation"
- state: "${locType}" (use the location/type exactly as given)
- city: the nearest city or the name of "${dest}"
- tour_type: "walking"
- description: 2-3 sentences about the destination's haunted history
- introduction: 3-4 sentences setting the scene
- conclusion: 2-3 sentences wrapping up
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "~0.8 miles"
- start_location_name: the main entrance
- start_latitude: real coordinates (number)
- start_longitude: real coordinates (number)
- image_url: empty string
- tags: array including "abroad" plus 2-4 relevant tags
- safety_info: 2-3 practical safety notes
- best_time: best season/time for investigating

PLUS a "stops" array (${stopCount} stops) — each with:
- stop_number: starting from 1
- name: specific area/building/room name within "${dest}"
- latitude: real coordinates (number)
- longitude: real coordinates (number)
- address: full address of "${dest}" in ${locType}
- historical_info: 2-3 sentences of the specific area's history
- paranormal_info: 2-3 sentences about paranormal activity reported in that specific area
- investigation_suggestions: 3-4 specific suggestions for investigating that area
- estimated_investigation_time: e.g. "20-30 minutes"
- construction_date: when that area was built if known
- famous_people: notable people associated with that area
- image_url: empty string
- narration_text: 2-3 sentences of evocative narration
- travel_method: "walking"
- hours_of_operation: e.g. "Day tours 9AM-5PM, ghost hunts until 2AM"
- entry_fee: e.g. "€15 day entry, €35 for night investigation"

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

      const tourData = {
        title: result.title,
        state: loc,
        location_type: locType,
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
        tags: [...new Set(['abroad', ...(result.tags || [])])],
        safety_info: result.safety_info || '',
        best_time: result.best_time || '',
      };

      const newTour = await base44.entities.Tour.create(tourData);

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
      setDestinationName('');
      setLocation('');
      setLocationType('');
      setStopCount('5-7');
      setSpecifics('');
      navigate(`/tour/${newTour.id}`);
    } catch (err) {
      console.error('Abroad tour generation failed', err);
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
              <div className="p-2.5 rounded-lg bg-accent/20">
                <Globe className="w-5 h-5 text-cyan-glow" />
              </div>
              <div>
                <h2 className="font-heading text-base font-semibold text-foreground">Tours Abroad</h2>
                <p className="text-[10px] text-muted-foreground font-heading uppercase tracking-wider">International Hauntings</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Destination Name
                </label>
                <div className="relative">
                  <Ghost className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. Edinburgh Castle"
                    value={destinationName}
                    onChange={e => setDestinationName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                    Location
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <select
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="" disabled className="bg-card text-muted-foreground">Select...</option>
                      <option value="England" className="bg-card text-foreground">England</option>
                      <option value="Scotland" className="bg-card text-foreground">Scotland</option>
                      <option value="Ireland" className="bg-card text-foreground">Ireland</option>
                      <option value="Wales" className="bg-card text-foreground">Wales</option>
                      <option value="France" className="bg-card text-foreground">France</option>
                      <option value="Germany" className="bg-card text-foreground">Germany</option>
                      <option value="Italy" className="bg-card text-foreground">Italy</option>
                      <option value="Spain" className="bg-card text-foreground">Spain</option>
                      <option value="Portugal" className="bg-card text-foreground">Portugal</option>
                      <option value="Netherlands" className="bg-card text-foreground">Netherlands</option>
                      <option value="Belgium" className="bg-card text-foreground">Belgium</option>
                      <option value="Switzerland" className="bg-card text-foreground">Switzerland</option>
                      <option value="Austria" className="bg-card text-foreground">Austria</option>
                      <option value="Czech Republic" className="bg-card text-foreground">Czech Republic</option>
                      <option value="Poland" className="bg-card text-foreground">Poland</option>
                      <option value="Romania" className="bg-card text-foreground">Romania</option>
                      <option value="Greece" className="bg-card text-foreground">Greece</option>
                      <option value="Turkey" className="bg-card text-foreground">Turkey</option>
                      <option value="Sweden" className="bg-card text-foreground">Sweden</option>
                      <option value="Norway" className="bg-card text-foreground">Norway</option>
                      <option value="Denmark" className="bg-card text-foreground">Denmark</option>
                      <option value="Finland" className="bg-card text-foreground">Finland</option>
                      <option value="Iceland" className="bg-card text-foreground">Iceland</option>
                      <option value="Russia" className="bg-card text-foreground">Russia</option>
                      <option value="Japan" className="bg-card text-foreground">Japan</option>
                      <option value="China" className="bg-card text-foreground">China</option>
                      <option value="India" className="bg-card text-foreground">India</option>
                      <option value="Thailand" className="bg-card text-foreground">Thailand</option>
                      <option value="South Korea" className="bg-card text-foreground">South Korea</option>
                      <option value="Vietnam" className="bg-card text-foreground">Vietnam</option>
                      <option value="Philippines" className="bg-card text-foreground">Philippines</option>
                      <option value="Indonesia" className="bg-card text-foreground">Indonesia</option>
                      <option value="Australia" className="bg-card text-foreground">Australia</option>
                      <option value="New Zealand" className="bg-card text-foreground">New Zealand</option>
                      <option value="Canada" className="bg-card text-foreground">Canada</option>
                      <option value="Mexico" className="bg-card text-foreground">Mexico</option>
                      <option value="Brazil" className="bg-card text-foreground">Brazil</option>
                      <option value="Argentina" className="bg-card text-foreground">Argentina</option>
                      <option value="Peru" className="bg-card text-foreground">Peru</option>
                      <option value="Chile" className="bg-card text-foreground">Chile</option>
                      <option value="Colombia" className="bg-card text-foreground">Colombia</option>
                      <option value="Egypt" className="bg-card text-foreground">Egypt</option>
                      <option value="Morocco" className="bg-card text-foreground">Morocco</option>
                      <option value="South Africa" className="bg-card text-foreground">South Africa</option>
                      <option value="Kenya" className="bg-card text-foreground">Kenya</option>
                      <option value="United Arab Emirates" className="bg-card text-foreground">United Arab Emirates</option>
                      <option value="Israel" className="bg-card text-foreground">Israel</option>
                      <option value="Saudi Arabia" className="bg-card text-foreground">Saudi Arabia</option>
                      <option value="Singapore" className="bg-card text-foreground">Singapore</option>
                      <option value="Malaysia" className="bg-card text-foreground">Malaysia</option>
                      <option value="Caribbean Sea" className="bg-card text-foreground">Caribbean Sea</option>
                      <option value="Mediterranean Sea" className="bg-card text-foreground">Mediterranean Sea</option>
                      <option value="North Atlantic" className="bg-card text-foreground">North Atlantic</option>
                      <option value="Pacific Ocean" className="bg-card text-foreground">Pacific Ocean</option>
                      <option value="Indian Ocean" className="bg-card text-foreground">Indian Ocean</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                    Type
                  </label>
                  <div className="relative">
                    <Ship className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <select
                      value={locationType}
                      onChange={e => setLocationType(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="" disabled className="bg-card text-muted-foreground">Select...</option>
                      <option value="Island" className="bg-card text-foreground">Island</option>
                      <option value="Ship" className="bg-card text-foreground">Ship</option>
                      <option value="Territory" className="bg-card text-foreground">Territory</option>
                      <option value="N/A" className="bg-card text-foreground">N/A</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Number of Stops
                </label>
                <select
                  value={stopCount}
                  onChange={e => setStopCount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors appearance-none cursor-pointer"
                >
                  <option value="3-4" className="bg-card text-foreground">3–4 stops</option>
                  <option value="5-7" className="bg-card text-foreground">5–7 stops</option>
                  <option value="8-10" className="bg-card text-foreground">8–10 stops</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">
                  Specifics <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <textarea
                  placeholder="e.g. focus on vampire legends, include the oldest wing, prioritize maritime ghost stories..."
                  value={specifics}
                  onChange={e => setSpecifics(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-accent text-accent-foreground font-heading text-xs uppercase tracking-wider hover:bg-accent/90 transition-colors disabled:opacity-60 shadow-[0_0_20px_hsl(270,40%,42%,0.3)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Tour...
                  </>
                ) : (
                  <>
                    <Ship className="w-4 h-4" />
                    Generate Abroad Tour
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/60 text-center">
                Creates a destination-focused tour at an international haunted location or vessel.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}