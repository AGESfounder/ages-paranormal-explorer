import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { US_STATES } from '../lib/statesData';

export default function States() {
  const [search, setSearch] = useState('');

  const filtered = US_STATES.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.abbr.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageContainer>
      <SectionHeader title="Explore States" subtitle="All 50 U.S. States" showBack />

      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search states..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card/50 border-border/50 text-foreground placeholder:text-muted-foreground/50 font-body"
          />
        </div>
      </div>

      <div className="px-4 pb-28 grid grid-cols-2 gap-2.5">
        {filtered.map((state, i) => (
          <motion.div
            key={state.abbr}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02, duration: 0.3 }}
          >
            <Link
              to={`/states/${state.abbr}`}
              className="flex items-center gap-3 p-3.5 rounded-lg border border-border/40 bg-card/30 hover:border-primary/40 hover:bg-card/50 transition-all duration-300 group"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors shrink-0">
                <span className="font-heading text-sm font-bold text-primary">{state.abbr}</span>
              </div>
              <div className="min-w-0">
                <p className="font-heading text-sm font-medium text-foreground truncate">{state.name}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" /> 5 Tours
                </p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <NavBar />
    </PageContainer>
  );
}