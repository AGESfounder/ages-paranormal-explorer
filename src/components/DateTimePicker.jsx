import React from 'react';
import { ChevronDown } from 'lucide-react';

const MONTHS = [
  { value: '', label: 'Month' },
  { value: '1', label: 'Jan' }, { value: '2', label: 'Feb' }, { value: '3', label: 'Mar' },
  { value: '4', label: 'Apr' }, { value: '5', label: 'May' }, { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' }, { value: '8', label: 'Aug' }, { value: '9', label: 'Sep' },
  { value: '10', label: 'Oct' }, { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];

function buildYears() {
  const current = new Date().getFullYear();
  const years = [{ value: '', label: 'Year' }];
  for (let y = current + 1; y >= current - 10; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}
const YEARS = buildYears();

const DAYS = [{ value: '', label: 'Day' }];
for (let d = 1; d <= 31; d++) DAYS.push({ value: String(d), label: String(d) });

const HOURS = [{ value: '', label: 'Hour' }];
for (let h = 1; h <= 12; h++) HOURS.push({ value: String(h), label: String(h) });

const MINUTES = [{ value: '', label: 'Min' }];
for (let m = 0; m <= 59; m++) MINUTES.push({ value: String(m), label: String(m).padStart(2, '0') });

const AMPM_OPTIONS = [
  { value: '', label: 'AM/PM' },
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

function parseDate(d) {
  if (!d) return { month: '', day: '', year: '' };
  const parts = d.split('-');
  if (parts.length !== 3) return { month: '', day: '', year: '' };
  return { year: parts[0], month: String(parseInt(parts[1], 10)), day: String(parseInt(parts[2], 10)) };
}

function parseTime(t) {
  if (!t) return { hour: '', minute: '', ampm: '' };
  const parts = t.split(':');
  if (parts.length !== 2) return { hour: '', minute: '', ampm: '' };
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (h === 0) return { hour: '12', minute: String(m), ampm: 'AM' };
  if (h < 12) return { hour: String(h), minute: String(m), ampm: 'AM' };
  if (h === 12) return { hour: '12', minute: String(m), ampm: 'PM' };
  return { hour: String(h - 12), minute: String(m), ampm: 'PM' };
}

function composeDate(parts) {
  if (!parts.month || !parts.day || !parts.year) return '';
  return `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')}`;
}

function composeTime(parts) {
  if (!parts.hour || parts.minute === '' || !parts.ampm) return '';
  let h = parseInt(parts.hour, 10);
  if (parts.ampm === 'AM' && h === 12) h = 0;
  if (parts.ampm === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function MiniSelect({ value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-card/50 border border-border/50 rounded-lg px-2 py-2.5 pr-7 text-sm text-foreground focus:outline-none focus:border-primary/50"
      >
        {options.map((o, i) => (
          <option key={i} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

export default function DateTimePicker({ date, time, onChange }) {
  const d = parseDate(date);
  const t = parseTime(time);

  const updateDate = (field, value) => {
    const newParts = { ...d, [field]: value };
    onChange({ date: composeDate(newParts), time });
  };

  const updateTime = (field, value) => {
    const newParts = { ...t, [field]: value };
    onChange({ date, time: composeTime(newParts) });
  };

  return (
    <div>
      <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1.5">
        Date &amp; Time <span className="text-red-400">*</span>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <MiniSelect value={d.month} onChange={v => updateDate('month', v)} options={MONTHS} />
        <MiniSelect value={d.day} onChange={v => updateDate('day', v)} options={DAYS} />
        <MiniSelect value={d.year} onChange={v => updateDate('year', v)} options={YEARS} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        <MiniSelect value={t.hour} onChange={v => updateTime('hour', v)} options={HOURS} />
        <MiniSelect value={t.minute} onChange={v => updateTime('minute', v)} options={MINUTES} />
        <MiniSelect value={t.ampm} onChange={v => updateTime('ampm', v)} options={AMPM_OPTIONS} />
      </div>
    </div>
  );
}