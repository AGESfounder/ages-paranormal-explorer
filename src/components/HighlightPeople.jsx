import React from 'react';

// Renders `text` with each notable person's name (from `people`) wrapped in a
// tappable, blue-highlighted button. Clicking calls onPerson(match).
export default function HighlightPeople({ text, people, onPerson }) {
  if (!text) return null;
  if (!people || people.length === 0) return <>{text}</>;

  const names = people
    .map(p => p.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return <>{text}</>;

  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(re);

  return (
    <>
      {(() => {
        const seen = new Set();
        return parts.map((part, i) => {
          const match = people.find(p => p.name.toLowerCase() === part.toLowerCase());
          if (match && !seen.has(match.name.toLowerCase())) {
            seen.add(match.name.toLowerCase());
            return (
              <button
                key={i}
                onClick={() => onPerson && onPerson(match)}
                className="text-sky-400 font-semibold hover:text-sky-300 hover:underline underline-offset-2 transition-colors"
              >
                {part}
              </button>
            );
          }
          return <span key={i}>{part}</span>;
        });
      })()}
    </>
  );
}