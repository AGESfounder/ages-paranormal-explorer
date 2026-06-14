import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';

const categories = [
  {
    letter: 'A',
    title: 'Investigation Classifications',
    terms: [
      { term: 'Active Investigation', desc: 'An investigation involving direct interaction, questioning, trigger objects, or experimentation.' },
      { term: 'Passive Investigation', desc: 'An investigation focused on observation and monitoring without attempting interaction.' },
      { term: 'Controlled Investigation', desc: 'Research conducted under conditions designed to eliminate known environmental influences.' },
      { term: 'Baseline Survey', desc: 'The initial collection of environmental data before an investigation begins.' },
      { term: 'Historical Investigation', desc: 'Research focused on uncovering historical events, people, and records associated with a location.' },
      { term: 'Follow-Up Investigation', desc: 'A return visit conducted to verify previous findings.' },
      { term: 'Residential Investigation', desc: 'An investigation conducted at a private residence.' },
      { term: 'Commercial Investigation', desc: 'An investigation conducted at a business, hotel, theater, or other public facility.' },
      { term: 'Outdoor Investigation', desc: 'Research performed in cemeteries, battlefields, parks, or wilderness areas.' },
    ],
  },
  {
    letter: 'B',
    title: 'Evidence Classification System',
    terms: [
      { term: 'Class 1 Evidence', desc: 'Interesting but easily explainable evidence.' },
      { term: 'Class 2 Evidence', desc: 'Evidence lacking an obvious explanation but requiring further review.' },
      { term: 'Class 3 Evidence', desc: 'Multiple data sources support the same event.' },
      { term: 'Class 4 Evidence', desc: 'Independent witness accounts and instrument data correlate.' },
      { term: 'Class 5 Evidence', desc: 'Highly compelling evidence reviewed repeatedly without explanation.' },
    ],
  },
  {
    letter: 'C',
    title: 'Haunting Categories',
    terms: [
      { term: 'Residual Haunting', desc: 'Activity believed to be a replay of past events without awareness.' },
      { term: 'Intelligent Haunting', desc: 'Activity appearing capable of interaction.' },
      { term: 'Crisis Haunting', desc: 'Phenomena associated with sudden death or trauma.' },
      { term: 'Anniversary Haunting', desc: 'Activity reportedly occurring on specific dates.' },
      { term: 'Object Haunting', desc: 'Activity associated with a particular artifact.' },
      { term: 'Location Haunting', desc: 'Activity tied to a building or geographic area.' },
      { term: 'Poltergeist Activity', desc: 'Physical disturbances such as noises, object movement, and impacts.' },
      { term: 'Environmental Haunting', desc: 'Activity suspected to result from natural environmental factors.' },
    ],
  },
  {
    letter: 'D',
    title: 'Environmental Factors',
    terms: [
      { term: 'Atmospheric Pressure', desc: 'Changes in barometric pressure recorded during investigations.' },
      { term: 'Geomagnetic Activity', desc: 'Fluctuations in Earth\'s magnetic field.' },
      { term: 'Humidity', desc: 'The amount of water vapor in the air.' },
      { term: 'Infrasound', desc: 'Sound frequencies below human hearing that may influence perception.' },
      { term: 'Electromagnetic Interference (EMI)', desc: 'Interference affecting electronic equipment.' },
      { term: 'Static Electricity', desc: 'Electrical charge accumulation capable of influencing equipment.' },
      { term: 'Air Ionization', desc: 'The concentration of electrically charged particles in the atmosphere.' },
      { term: 'Seismic Vibrations', desc: 'Ground movement potentially affecting structures and perception.' },
    ],
  },
  {
    letter: 'E',
    title: 'Equipment Terms',
    terms: [
      { term: 'EMF Meter', desc: 'A device used to measure electromagnetic fields.' },
      { term: 'K2 Meter', desc: 'A handheld LED-based EMF detector.' },
      { term: 'REM Device', desc: 'A proximity detection device utilizing an electromagnetic antenna field.' },
      { term: 'Spirit Box', desc: 'A radio-frequency scanning device used during communication sessions.' },
      { term: 'DVR System', desc: 'Digital video recording system.' },
      { term: 'Trigger Object', desc: 'An object placed to encourage interaction.' },
      { term: 'Thermal Camera', desc: 'A device detecting infrared heat signatures.' },
      { term: 'Laser Grid', desc: 'A projected pattern used to identify movement disturbances.' },
      { term: 'Motion Detector', desc: 'A device that senses movement.' },
      { term: 'IR Camera', desc: 'An infrared-sensitive camera used in darkness.' },
      { term: 'Full Spectrum Camera', desc: 'A camera modified to detect ultraviolet and infrared wavelengths.' },
      { term: 'Data Logger', desc: 'Equipment used to continuously record environmental conditions.' },
      { term: 'Digital Audio Recorder', desc: 'A high-sensitivity recorder used for EVP collection.' },
      { term: 'Geophone', desc: 'A vibration detection device.' },
      { term: 'IR Doorbell Alert', desc: 'A modified infrared motion alarm commonly used in paranormal research.' },
    ],
  },
  {
    letter: 'F',
    title: 'Audio Evidence Terms',
    terms: [
      { term: 'EVP Session', desc: 'An attempt to record electronic voice phenomena.' },
      { term: 'Class A EVP', desc: 'Clearly understandable without interpretation.' },
      { term: 'Class B EVP', desc: 'Partially understandable.' },
      { term: 'Class C EVP', desc: 'Difficult to interpret.' },
      { term: 'Direct Voice Phenomenon (DVP)', desc: 'Voices reportedly heard directly.' },
      { term: 'Anomalous Audio', desc: 'Any unexplained sound recording.' },
      { term: 'Phantom Knock', desc: 'Unexplained knocking sounds.' },
      { term: 'Phantom Footsteps', desc: 'Unexplained sounds resembling movement.' },
      { term: 'Audio Contamination', desc: 'Noise accidentally introduced into recordings.' },
      { term: 'Pareidolia', desc: 'The tendency to interpret random sounds as meaningful speech.' },
    ],
  },
  {
    letter: 'G',
    title: 'Visual Evidence Terms',
    terms: [
      { term: 'Apparition', desc: 'A visible manifestation believed to be paranormal.' },
      { term: 'Shadow Figure', desc: 'A dark human-shaped figure.' },
      { term: 'Orb', desc: 'A circular photographic artifact.' },
      { term: 'Mist Formation', desc: 'A visible vapor-like anomaly.' },
      { term: 'Light Anomaly', desc: 'An unexplained light source.' },
      { term: 'Partial Manifestation', desc: 'Only part of an alleged apparition is visible.' },
      { term: 'Full-Body Apparition', desc: 'A complete human-like figure.' },
      { term: 'Transparent Apparition', desc: 'An apparition through which background objects remain visible.' },
      { term: 'Visual Pareidolia', desc: 'Seeing recognizable forms in random patterns.' },
    ],
  },
  {
    letter: 'H',
    title: 'Paranormal Theories',
    terms: [
      { term: 'Stone Tape Theory', desc: 'The hypothesis that emotional events become recorded in environments.' },
      { term: 'Residual Energy Theory', desc: 'The idea that traumatic events leave energetic imprints.' },
      { term: 'Portal Theory', desc: 'The belief that certain locations act as gateways.' },
      { term: 'Vortex Theory', desc: 'The belief that concentrated energy exists at specific locations.' },
      { term: 'Consciousness Survival Theory', desc: 'The concept that consciousness survives death.' },
      { term: 'Interdimensional Theory', desc: 'The hypothesis that some phenomena originate from alternate dimensions.' },
      { term: 'Simulation Theory', desc: 'The speculative belief that reality is a simulation.' },
      { term: 'Quantum Consciousness Theory', desc: 'Speculative theories connecting consciousness and quantum mechanics.' },
    ],
  },
  {
    letter: 'I',
    title: 'Spirit Communication Terms',
    terms: [
      { term: 'EVP Question Session', desc: 'A structured communication attempt.' },
      { term: 'Call-and-Response Session', desc: 'Questions are followed by periods of silence for responses.' },
      { term: 'ITC (Instrumental Transcommunication)', desc: 'Spirit communication using electronic devices.' },
      { term: 'Trigger Session', desc: 'Using meaningful objects to encourage interaction.' },
      { term: 'Estes Method', desc: 'A technique where one investigator listens to a spirit box while blindfolded.' },
      { term: 'Session Control', desc: 'The investigator directing questions and procedures.' },
      { term: 'Session Documentation', desc: 'Recording all questions and responses.' },
    ],
  },
  {
    letter: 'J',
    title: 'Historical Research Terms',
    terms: [
      { term: 'Deed Research', desc: 'Reviewing property ownership records.' },
      { term: 'Census Research', desc: 'Examining historical population records.' },
      { term: 'Newspaper Archive Review', desc: 'Researching historical events and incidents.' },
      { term: 'Death Certificate Analysis', desc: 'Reviewing official death records.' },
      { term: 'Land Grant Records', desc: 'Documents identifying historical property ownership.' },
      { term: 'Oral History', desc: 'Information passed through local accounts and traditions.' },
      { term: 'Historical Correlation', desc: 'Matching reported activity to documented events.' },
    ],
  },
  {
    letter: 'K',
    title: 'Cryptozoology Terms',
    terms: [
      { term: 'Cryptid', desc: 'An unverified animal species.' },
      { term: 'Bigfoot', desc: 'A large bipedal cryptid reported throughout North America.' },
      { term: 'Dogman', desc: 'A reported canine-humanoid cryptid.' },
      { term: 'Mothman', desc: 'A winged humanoid cryptid first reported in West Virginia.' },
      { term: 'Lake Monster', desc: 'An unidentified aquatic cryptid.' },
      { term: 'Thunderbird', desc: 'A giant bird reported in Native American traditions and modern sightings.' },
    ],
  },
  {
    letter: 'L',
    title: 'Folklore & Supernatural Entities',
    terms: [
      { term: 'Banshee', desc: 'An Irish spirit associated with death omens.' },
      { term: 'Wraith', desc: 'A ghostly apparition associated with impending death.' },
      { term: 'Yurei', desc: 'A Japanese ghost.' },
      { term: 'Yokai', desc: 'Supernatural beings from Japanese folklore.' },
      { term: 'Doppelgänger', desc: 'A supernatural double of a living person.' },
      { term: 'Elemental', desc: 'A spirit associated with natural forces.' },
      { term: 'Guardian Spirit', desc: 'A spirit believed to protect individuals or locations.' },
      { term: 'Trickster Entity', desc: 'A being reported to deceive or mislead witnesses.' },
    ],
  },
  {
    letter: 'M',
    title: 'Haunted Location Types',
    terms: [
      { term: 'Battlefield', desc: 'Historic conflict sites frequently associated with paranormal reports.' },
      { term: 'Cemetery', desc: 'Burial grounds commonly investigated.' },
      { term: 'Plantation', desc: 'Historic estates associated with numerous reported hauntings.' },
      { term: 'Prison', desc: 'Former correctional facilities often linked to paranormal claims.' },
      { term: 'Hospital', desc: 'Medical facilities with reported residual activity.' },
      { term: 'Hotel', desc: 'Commercial lodging locations with recurring reports.' },
      { term: 'Theater', desc: 'Entertainment venues associated with apparition sightings.' },
      { term: 'Lighthouse', desc: 'Coastal structures often linked to maritime legends.' },
      { term: 'Schoolhouse', desc: 'Historic educational facilities with reported activity.' },
      { term: 'Government Building', desc: 'Historic public structures with documented folklore.' },
    ],
  },
  {
    letter: 'N',
    title: 'Investigation Documentation',
    terms: [
      { term: 'Investigation Log', desc: 'Chronological record of events.' },
      { term: 'Evidence Review Sheet', desc: 'Standardized analysis form.' },
      { term: 'Witness Interview Form', desc: 'Structured witness questionnaire.' },
      { term: 'Site Map', desc: 'Diagram of investigation areas.' },
      { term: 'Environmental Log', desc: 'Record of environmental conditions.' },
      { term: 'Chain of Custody', desc: 'Documentation tracking evidence handling.' },
      { term: 'Event Timeline', desc: 'Chronological reconstruction of activity.' },
    ],
  },
  {
    letter: 'O',
    title: 'Research Ethics',
    terms: [
      { term: 'Informed Consent', desc: 'Permission obtained before investigations.' },
      { term: 'Historical Respect', desc: 'Accurate representation of historical facts.' },
      { term: 'Cultural Sensitivity', desc: 'Respecting traditions and beliefs.' },
      { term: 'Preservation', desc: 'Avoiding damage to historic properties.' },
      { term: 'Evidence Integrity', desc: 'Presenting findings honestly.' },
      { term: 'Scientific Skepticism', desc: 'Evaluating claims objectively.' },
    ],
  },
  {
    letter: 'P',
    title: 'A.G.E.S. Investigation Methodology',
    terms: [
      { term: 'Assess', desc: 'Research historical records and witness reports.' },
      { term: 'Gather', desc: 'Collect environmental, audio, and visual data.' },
      { term: 'Evaluate', desc: 'Analyze findings for natural explanations.' },
      { term: 'Share', desc: 'Document and present conclusions responsibly.' },
    ],
  },
];

export default function ResearchDatabase() {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});

  const toggleCategory = (letter) => {
    setExpanded(prev => ({ ...prev, [letter]: !prev[letter] }));
  };

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map(cat => ({
        ...cat,
        terms: cat.terms.filter(
          t => t.term.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.terms.length > 0);
  }, [search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search all terms..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-lg bg-card/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>

      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
        {filteredCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matching terms found.</p>
        ) : (
          filteredCategories.map(cat => (
            <div key={cat.letter} className="rounded-lg bg-card/30 border border-border/30 overflow-hidden">
              <button
                onClick={() => toggleCategory(cat.letter)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-primary/15 text-primary text-[10px] font-bold font-heading flex items-center justify-center">
                    {cat.letter}
                  </span>
                  <span className="text-xs font-heading font-semibold text-foreground uppercase tracking-wider">
                    {cat.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground">({cat.terms.length})</span>
                </div>
                {expanded[cat.letter] ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
              {expanded[cat.letter] && (
                <div className="px-3 pb-2.5 space-y-1.5 pt-1 border-t border-border/20">
                  {cat.terms.map((item, i) => (
                    <div key={i} className="py-1.5 px-2 rounded bg-black/20">
                      <p className="text-xs font-medium text-foreground">{item.term}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}