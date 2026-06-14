import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Thermometer, Radio, Waves, Moon, Volume2, Eye, Wrench, Search, BookOpen, Shield, Cloud } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';

const tools = [
  { name: 'EMF Meter', icon: Zap, desc: 'Detect electromagnetic field fluctuations in your environment', status: 'active', reading: '2.3 mG' },
  { name: 'Thermometer', icon: Thermometer, desc: 'Monitor ambient temperature for cold spots', status: 'active', reading: '67°F' },
  { name: 'Spirit Box', icon: Radio, desc: 'Sweep radio frequencies to capture EVP responses', status: 'ready' },
  { name: 'Audio Recorder', icon: Waves, desc: 'Record EVP sessions and paranormal audio', status: 'ready' },
  { name: 'Moon Phase', icon: Moon, desc: 'Current moon phase for your investigation', status: 'active', reading: 'Waxing Gibbous' },
  { name: 'Audio Controls', icon: Volume2, desc: 'Narration and background music volume', status: 'settings' },
  { name: 'Night Vision', icon: Eye, desc: 'Enhance your camera for low-light conditions', status: 'ready' },
  { name: 'Weather Monitor', icon: Cloud, desc: 'Check weather conditions for outdoor investigations', status: 'active', reading: 'Clear, 62°F' },
  { name: 'Research Database', icon: Search, desc: 'Search historical and paranormal records', status: 'ready' },
  { name: 'Equipment Guide', icon: BookOpen, desc: 'Learn about ghost hunting equipment', status: 'ready' },
  { name: 'Safety Protocol', icon: Shield, desc: 'Review safety guidelines for investigations', status: 'ready' },
  { name: 'Evidence Analyzer', icon: Wrench, desc: 'Review and analyze your collected evidence', status: 'ready' },
];

export default function Toolkit() {
  return (
    <PageContainer>
      <SectionHeader title="Investigation Toolkit" subtitle="Ghost Hunting Tools" showBack />
      <div className="px-4 pb-28 pt-3">
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 mb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your paranormal investigation toolkit. Use these digital tools to assist your ghost hunting expeditions.
            Always bring physical equipment as backup.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {tools.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="p-3.5 rounded-xl border border-border/40 bg-card/30 hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${tool.status === 'active' ? 'bg-primary/20' : 'bg-secondary/30'}`}>
                  <tool.icon className={`w-4 h-4 ${tool.status === 'active' ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-heading uppercase tracking-wider ${
                  tool.status === 'active' ? 'bg-green-500/10 text-green-400' :
                  tool.status === 'ready' ? 'bg-primary/10 text-primary' : 'bg-secondary/30 text-muted-foreground'
                }`}>{tool.status}</span>
              </div>
              <p className="text-xs font-medium text-foreground mb-1">{tool.name}</p>
              {tool.reading && <p className="font-display text-lg text-primary">{tool.reading}</p>}
              <p className="text-[10px] text-muted-foreground leading-relaxed">{tool.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <NavBar />
    </PageContainer>
  );
}